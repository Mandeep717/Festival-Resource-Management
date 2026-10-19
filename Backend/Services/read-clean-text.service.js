import {extractText}from 'unpdf'

// Clean extracted text by removing unwanted characters, normalizing line endings, and trimming whitespace.
function cleanExtractedText(text) {
  return (
    text
      // Remove null characters and the UTF-8 byte-order mark.
      .replace(/\u0000|\uFEFF/g, "")

      // Convert Windows and older Mac line endings to "\n".
      .replace(/\r\n?/g, "\n")

      // Replace non-breaking spaces with normal spaces.
      .replace(/\u00A0/g, " ")

      // Remove table-of-contents dot leaders.
      .replace(/\.{3,}/g, " ")

      // Remove spaces and tabs before line breaks.
      .replace(/[ \t]+\n/g, "\n")
      // Remove TOC dot leaders, including dots separated by spaces.
      .replace(/(?:\.[ \t]*){3,}/g, " ")

      // Replace repeated spaces and tabs with one space.
      .replace(/[ \t]{2,}/g, " ")

      // Keep a maximum of one empty line between paragraphs.
      .replace(/\n{3,}/g, "\n\n")

      // Remove whitespace from the beginning and end.
      .trim()
  );
}

//Convert PDF buffer to text
export async function extractTextFromPDF(fileBuffer){
    //Convert PDF buffer to text
    const pdfData = new Uint8Array(fileBuffer)
    //Convert PDF buffer to text using unpdf
    const {text} = await extractText(pdfData, {mergePages: true})
    //Clean the extracted text
    let cleanedText = cleanExtractedText(text)
    return cleanedText
}
