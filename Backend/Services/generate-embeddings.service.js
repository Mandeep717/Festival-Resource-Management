import {OllamaEmbeddings} from "@langchain/ollama"
import { config } from 'dotenv'
config()

const embeddingModel = new OllamaEmbeddings({
    model: "embeddinggemma",
    baseUrl: process.env.LLM_URL || "http://localhost:11434"
})

export async function generateChunkEmbeddings(festivalId, documentId, chunks){
    let chunkEmbeddings = []
    for(let [index, chunk] of chunks.entries()){
        const chunkText = chunk.trim()
        if(!chunkText) continue
        //Get embedding for the chunk
        const embedding = await embeddingModel.embedQuery(chunkText)
        //Push data to array
        chunkEmbeddings.push({
            festivalId,
            documentId,
            chunkIndex: index,
            content: chunkText,
            embedding: embedding
        })
    }
    return chunkEmbeddings
}

export async function generateQueryEmbedding(query){
    const queryEmbedding = await embeddingModel.embedQuery(query)
    return queryEmbedding
}
