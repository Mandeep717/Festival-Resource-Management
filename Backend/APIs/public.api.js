import exp from "express";
import crypto from "node:crypto";
import { Types } from "mongoose";
import { optionalVerifyToken, verifyToken } from "../Middlewares/verify-token.middleware.js";
import { allowedRoles } from "../Middlewares/allowed-roles.middleware.js";
import { FestivalModel } from "../Models/festival.model.js";
import { ScheduleVersionModel } from "../Models/schedule-version.model.js";
import { FestivalSessionModel } from "../Models/festival-sessions.model.js";
import { ConversationModel } from "../Models/conversation.model.js";
import { DocumentModel } from "../Models/document.model.js";
import { ChunkModel } from "../Models/chunk.model.js";
import { FestivalMembershipModel } from "../Models/festival-membership.model.js";
import { generateQueryEmbedding } from "../Services/generate-embeddings.service.js";
import {
    generateAnswerWithHistory,
    generateStandaloneQuery,
    runOperationsAgent,
} from "../Services/llm.service.js";

export const publicRouter = exp.Router()

const chatAttempts = new Map();
const CHAT_WINDOW_MS = 15 * 60 * 1000;
const CHAT_MAX_REQUESTS = 30;

function publicChatLimit(req, res, next) {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    let entry = chatAttempts.get(key);
    if (!entry || now >= entry.resetAt) entry = {count: 0, resetAt: now + CHAT_WINDOW_MS};
    if (entry.count >= CHAT_MAX_REQUESTS) {
        res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
        return res.status(429).json({success: false, message: "Too many festival guide requests. Please try again later."});
    }
    entry.count += 1;
    chatAttempts.set(key, entry);
    if (chatAttempts.size > 10_000) {
        for (const [address, attempt] of chatAttempts) if (now >= attempt.resetAt) chatAttempts.delete(address);
    }
    return next();
}

function getVisitorId(req, res) {
    const existing = req.cookies?.festivalVisitor;
    if (typeof existing === "string" && /^[a-f0-9]{64}$/i.test(existing)) return existing;
    const visitorId = crypto.randomBytes(32).toString("hex");
    res.cookie("festivalVisitor", visitorId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: "/",
    });
    return visitorId;
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
    }).populate("scheduleSnapshot.venueId", "name address")
    if (!schedule) {
        return res.status(404).json({message: "Published schedule not found"})
    }
    const sessionIds = schedule.scheduleSnapshot.map(entry => entry.sessionId)
    let sessions = await FestivalSessionModel.find({_id: {$in: sessionIds}, festivalId})
        .populate("venueId", "name address")
        .lean()
    if(!sessions.length){
        return res.status(404).json({message: "No sessions found for this festival"})
    }
    const scheduleEntries = new Map(
        schedule.scheduleSnapshot.map((entry) => [String(entry.sessionId), entry])
    )
    sessions = sessions.map((session) => {
        const scheduled = scheduleEntries.get(String(session._id))
        return scheduled ? {
            ...session,
            startTime: scheduled.startTime,
            endTime: scheduled.endTime,
            venueId: scheduled.venueId,
        } : session
    })
    res.status(200).json({success: true, sessions: sessions, message: "Festival sessions retrieved successfully"})
})

//Event-policy chat
publicRouter.post(
    "/festivals/:festivalId/chat",
    optionalVerifyToken,
    publicChatLimit,
    async (req, res) => {
        const { festivalId } = req.params;
        if (!Types.ObjectId.isValid(festivalId)) {
            return res.status(400).json({success: false, message: "Invalid festival ID"});
        }

        const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
        if (!query || query.length > 4000) {
            return res.status(400).json({success: false, message: "Query must contain between 1 and 4000 characters"});
        }

        const visitorId = req.user ? null : getVisitorId(req, res);
        const conversationOwner = req.user
            ? {userId: req.user.userId}
            : {visitorId};
        const { conversationId } = req.body || {};
        let conversation = null;
        const festival = await FestivalModel.findById(festivalId).select("name description location startDate endDate registrationStartDate registrationDeadline registrationFee status").lean();
        if (!festival) return res.status(404).json({success: false, message: "Festival not found"});

        if (conversationId) {
            if (!Types.ObjectId.isValid(conversationId)) {
                return res.status(400).json({success: false, message: "Invalid conversation ID"});
            }

            conversation = await ConversationModel.findOne({
                _id: conversationId,
                festivalId,
                ...conversationOwner,
            });
            if (!conversation) {
                return res.status(404).json({success: false, message: "Conversation not found"});
            }
        }

        const history = conversation?.messages?.slice(-10) || [];
        const standaloneQuery = history.length
            ? await generateStandaloneQuery(query, history)
            : query;

        const membership = req.user ? await FestivalMembershipModel.findOne({
            festivalId,
            userId: req.user.userId,
            membershipType: req.user.accountType,
            status: "active",
        }).select("membershipType").lean() : null;
        const visibilityByRole = {
            attendee: ["public"],
            volunteer: ["public", "staff"],
            organizer: ["public", "staff", "organizer"],
        };
        // Festival members keep their existing role access; everyone else sees public material only.
        const allowedVisibility = membership
            ? visibilityByRole[membership.membershipType] || ["public"]
            : ["public"];

        const documents = await DocumentModel.find({
            festivalId,
            isActive: true,
            visibility: {$in: allowedVisibility},
        }).select("_id title").lean();

        const documentById = new Map(documents.map(document => [String(document._id), document]));
        let retrievedChunks = [];

        if (documents.length) {
            const queryEmbedding = await generateQueryEmbedding(standaloneQuery);
            const chunks = await ChunkModel.aggregate([
                {
                    $vectorSearch: {
                        index: "festival_index",
                        path: "embedding",
                        queryVector: queryEmbedding,
                        numCandidates: 100,
                        limit: 5,
                        filter: {
                            $and: [
                                {festivalId: new Types.ObjectId(festivalId)},
                                {documentId: {$in: documents.map(document => document._id)}},
                                {visibility: {$in: allowedVisibility}},
                            ],
                        },
                    },
                },
                {
                    $project: {
                        documentId: 1,
                        content: 1,
                        chunkIndex: 1,
                        score: {$meta: "vectorSearchScore"},
                    },
                },
            ]);

            retrievedChunks = chunks
                .filter(chunk => Number.isFinite(chunk.score) && typeof chunk.content === "string" && chunk.content.trim())
                .map(chunk => ({
                    ...chunk,
                    documentId: {
                        _id: chunk.documentId,
                        title: documentById.get(String(chunk.documentId))?.title || "Festival document",
                    },
                }));
        }

        const festivalDetails = [
            `Festival: ${festival.name}`,
            festival.description ? `Description: ${festival.description}` : null,
            festival.location ? `Location: ${festival.location}` : null,
            festival.startDate ? `Starts: ${festival.startDate.toISOString()}` : null,
            festival.endDate ? `Ends: ${festival.endDate.toISOString()}` : null,
            festival.status ? `Status: ${festival.status}` : null,
            festival.registrationStartDate ? `Registration opens: ${festival.registrationStartDate.toISOString()}` : null,
            festival.registrationDeadline ? `Registration deadline: ${festival.registrationDeadline.toISOString()}` : null,
            Number.isFinite(festival.registrationFee) ? `Registration fee: ${festival.registrationFee}` : null,
        ].filter(Boolean).join("\n");
        retrievedChunks.unshift({
            content: festivalDetails,
            documentId: {_id: festival._id, title: "Festival details"},
            chunkIndex: 0,
            score: 1,
        });

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
                {_id: conversation._id, festivalId, ...conversationOwner},
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
                ...conversationOwner,
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

