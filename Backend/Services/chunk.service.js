import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export async function splitArticleIntoChunks(articleContent) {
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize:800,
        chunkOverlap:100
    })
    let chunks = await splitter.splitText(articleContent)
    return chunks
}