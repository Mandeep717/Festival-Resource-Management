import exp from "express";
import { Types } from "mongoose";
import { verifyToken } from "../Middlewares/verify-token.middleware.js";
import { allowedRoles } from "../Middlewares/allowed-roles.middleware.js";
import { FestivalModel } from "../Models/festival.model.js";
import { ScheduleVersionModel } from "../Models/schedule-version.model.js";
import { FestivalSessionModel } from "../Models/festival-sessions.model.js";
import { ConversationModel } from "../Models/conversation.model.js";
import { DocumentModel } from "../Models/document.model.js";
import { ChunkModel } from "../Models/chunk.model.js";
import { generateQueryEmbedding } from "../Services/generate-embeddings.service.js";
import {
    generateAnswerWithHistory,
    generateStandaloneQuery,
    runOperationsAgent,
} from "../Services/llm.service.js";

export const publicRouter = exp.Router()

function cosineSimilarity(vectorA, vectorB) {
    if (!Array.isArray(vectorA) || !Array.isArray(vectorB) || vectorA.length !== vectorB.length || vectorA.length === 0) {
        return null;
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let index = 0; index < vectorA.length; index += 1) {
        const valueA = Number(vectorA[index]);
        const valueB = Number(vectorB[index]);
        if (!Number.isFinite(valueA) || !Number.isFinite(valueB)) return null;
        dotProduct += valueA * valueB;
        magnitudeA += valueA * valueA;
        magnitudeB += valueB * valueB;
    }

    if (magnitudeA === 0 || magnitudeB === 0) return null;
    return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

//Get festival by slug - Public endpoint
publicRouter.get("/festivals/:slug", async(req, res)=>{
    let {slug} = req.params
    let festival = await FestivalModel.findOne({slug: slug})
    if(!festival){
        return res.status(404).json({message: "Festival not found"})
    }
    res.status(200).json({success: true, festival: festival, message: "Festival details retrieved successfully"})
})

//Get festival schedule by festival id - Public endpoint
publicRouter.get("/festivals/:festivalId/schedule", async(req, res)=>{
    let {festivalId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        res.status(400).json({message: "Invalid festival ID"})
        return
    }
    const festival = await FestivalModel.findById(festivalId).select("publishedScheduleId")
    if (!festival?.publishedScheduleId) {
        return res.status(404).json({message: "Published schedule not found"})
    }
    let schedule = await ScheduleVersionModel.findOne({
        _id: festival.publishedScheduleId,
        festivalId,
        status: "published"
    })
    if(!schedule){
        return res.status(404).json({message: "Schedule not found"})
    }
    res.status(200).json({success: true, schedule: schedule, message: "Schedule details retrieved successfully"})
})

//View relevant festival sessions for a specific festival
publicRouter.get("/festivals/:festivalId/sessions", async(req, res)=>{
    let {festivalId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    const festival = await FestivalModel.findById(festivalId).select("publishedScheduleId")
    if (!festival?.publishedScheduleId) {
        return res.status(404).json({message: "Published schedule not found"})
    }
    const schedule = await ScheduleVersionModel.findOne({
        _id: festival.publishedScheduleId,
        festivalId,
        status: "published"
    })
    if (!schedule) {
        return res.status(404).json({message: "Published schedule not found"})
    }
    const sessionIds = schedule.scheduleSnapshot.map(entry => entry.sessionId)
    let sessions = await FestivalSessionModel.find({_id: {$in: sessionIds}, festivalId})
    if(!sessions.length){
        return res.status(404).json({message: "No sessions found for this festival"})
    }
    res.status(200).json({success: true, sessions: sessions, message: "Festival sessions retrieved successfully"})
})

//Event-policy chat
publicRouter.post(
    "/festivals/:festivalId/chat",
    verifyToken,
    allowedRoles(["attendee", "volunteer", "organizer"]),
    async (req, res) => {
        const { festivalId } = req.params;
        if (!Types.ObjectId.isValid(festivalId)) {
            return res.status(400).json({success: false, message: "Invalid festival ID"});
        }

        const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
        if (!query || query.length > 4000) {
            return res.status(400).json({success: false, message: "Query must contain between 1 and 4000 characters"});
        }

        const userId = req.user.userId;
        const { conversationId } = req.body || {};
        let conversation = null;

        if (conversationId) {
            if (!Types.ObjectId.isValid(conversationId)) {
                return res.status(400).json({success: false, message: "Invalid conversation ID"});
            }

            conversation = await ConversationModel.findOne({
                _id: conversationId,
                festivalId,
                userId,
            });
            if (!conversation) {
                return res.status(404).json({success: false, message: "Conversation not found"});
            }
        }

        const history = conversation?.messages?.slice(-10) || [];
        const standaloneQuery = history.length
            ? await generateStandaloneQuery(query, history)
            : query;

        const visibilityByRole = {
            attendee: ["public"],
            volunteer: ["public", "staff"],
            organizer: ["public", "staff", "organizer"],
        };
        const allowedVisibility = visibilityByRole[req.festivalRole];
        if (!allowedVisibility) {
            return res.status(403).json({success: false, message: "Festival membership is not authorized for event-policy chat"});
        }

        const documents = await DocumentModel.find({
            festivalId,
            isActive: true,
            visibility: {$in: allowedVisibility},
        }).select("_id title").lean();

        const documentById = new Map(documents.map(document => [String(document._id), document]));
        let retrievedChunks = [];

        if (documents.length) {
            const queryEmbedding = await generateQueryEmbedding(standaloneQuery);
            const chunks = await ChunkModel.find({
                festivalId,
                documentId: {$in: documents.map(document => document._id)},
                visibility: {$in: allowedVisibility},
            }).select("documentId content chunkIndex embedding").lean();

            retrievedChunks = chunks
                .map(chunk => ({
                    ...chunk,
                    score: cosineSimilarity(queryEmbedding, chunk.embedding),
                }))
                .filter(chunk => Number.isFinite(chunk.score) && typeof chunk.content === "string" && chunk.content.trim())
                .sort((a, b) => b.score - a.score)
                .slice(0, 5)
                .map(chunk => ({
                    ...chunk,
                    documentId: {
                        _id: chunk.documentId,
                        title: documentById.get(String(chunk.documentId))?.title || "Festival document",
                    },
                }));
        }

        const answer = await generateAnswerWithHistory(
            standaloneQuery,
            retrievedChunks,
            history
        );

        const citations = retrievedChunks.map((chunk, index) => ({
            sourceId: `S${index + 1}`,
            documentId: String(chunk.documentId._id),
            title: chunk.documentId.title,
            chunkIndex: chunk.chunkIndex,
        }));

        if (conversation) {
            await ConversationModel.updateOne(
                {_id: conversation._id, festivalId, userId},
                {$push: {
                    messages: {
                        $each: [
                            {role: "user", content: query},
                            {role: "assistant", content: answer},
                        ],
                        $slice: -20,
                    },
                }}
            );
        } else {
            conversation = await ConversationModel.create({
                festivalId,
                userId,
                messages: [
                    {role: "user", content: query},
                    {role: "assistant", content: answer},
                ],
            });
        }

        return res.status(200).json({
            success: true,
            answer,
            citations,
            conversationId: conversation._id,
            message: "Answer retrieved successfully",
        });
    }
);

//Operations Agent: analyze a possible session move without changing the schedule.
publicRouter.post(
    "/operations-agent",
    verifyToken,
    (req, res, next) => {
        if (!Types.ObjectId.isValid(req.body?.festivalId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid festival ID",
            });
        }
        next();
    },
    allowedRoles(["volunteer", "organizer"]),
    async (req, res) => {
        const {
            festivalId,
            sessionId,
            request,
            windowStart,
            windowEnd,
        } = req.body || {};

        if (!Types.ObjectId.isValid(sessionId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid session ID",
            });
        }

        if (typeof request !== "string" || !request.trim() || request.length > 2000) {
            return res.status(400).json({
                success: false,
                message: "Request must contain between 1 and 2000 characters",
            });
        }

        const start = new Date(windowStart);
        const end = new Date(windowEnd);
        if (
            !windowStart ||
            !windowEnd ||
            !Number.isFinite(start.getTime()) ||
            !Number.isFinite(end.getTime()) ||
            start >= end
        ) {
            return res.status(400).json({
                success: false,
                message: "A valid search window with windowEnd after windowStart is required",
            });
        }

        if (end.getTime() - start.getTime() > 7 * 24 * 60 * 60 * 1000) {
            return res.status(400).json({
                success: false,
                message: "Search window cannot exceed seven days",
            });
        }

        const festival = await FestivalModel.findById(festivalId)
            .select("startDate endDate publishedScheduleId")
            .lean();
        if (!festival) {
            return res.status(404).json({
                success: false,
                message: "Festival not found",
            });
        }
        if (!festival.publishedScheduleId) {
            return res.status(409).json({
                success: false,
                message: "The festival has no published schedule to analyze",
            });
        }

        if (
            start < new Date(festival.startDate) ||
            end > new Date(festival.endDate)
        ) {
            return res.status(400).json({
                success: false,
                message: "Search window must be within the festival dates",
            });
        }

        const schedule = await ScheduleVersionModel.findOne({
            _id: festival.publishedScheduleId,
            festivalId,
            status: "published",
        })
            .select("_id")
            .lean();
        if (!schedule) {
            return res.status(409).json({
                success: false,
                message: "Published schedule could not be found",
            });
        }

        const result = await runOperationsAgent({
            festivalId: String(festivalId),
            scheduleVersionId: String(schedule._id),
            sessionId: String(sessionId),
            request: request.trim(),
            windowStart: start.toISOString(),
            windowEnd: end.toISOString(),
        });

        return res.status(200).json({
            success: true,
            message: "Operations recommendation generated",
            ...result,
        });
    }
);

