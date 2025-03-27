import { OpenAIEmbeddings } from "@langchain/openai"
import { MongoClient } from "mongodb"
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb"
import "dotenv/config"
import { convertPDFToData } from "./convert-pdf"
import { createEmployeeSummary } from "./seed-database"
import { tool } from "@langchain/core/tools"
import { z } from "zod"

const client = new MongoClient(process.env.MONGODB_ATLAS_URI as string)
const dbName = "hr_database"
const db = client.db(dbName)
const collection = db.collection("employees")

const duplicateResumeCheckTool = tool(
  async ({ resumeSummary, threshold = 0.98 }) => {
    console.log("🔍 Duplicate resume check tool called")

    const dbConfig = {
      collection,
      indexName: "vector_index",
      textKey: "embedding_text",
      embeddingKey: "embedding",
    }

    const vectorStore = new MongoDBAtlasVectorSearch(
      new OpenAIEmbeddings(),
      dbConfig
    )

    const results = await vectorStore.similaritySearchWithScore(
      resumeSummary,
      1
    )
    const [topResult] = results
    const similarityScore = topResult?.[1] ?? 0

    console.log("Similarity score:", similarityScore)

    if (similarityScore >= threshold) {
      return JSON.stringify({
        duplicate: true,
        message: "⚠️ This resume is very similar to an existing entry.",
        similarityScore,
      })
    }

    return JSON.stringify({
      duplicate: false,
      message: "✅ No similar resume found.",
      similarityScore,
    })
  },
  {
    name: "duplicate_resume_check",
    description:
      "Checks if a given resume is a near-duplicate of an existing employee in the database",
    schema: z.object({
      resumeSummary: z
        .string()
        .describe(
          "A cleaned, summarized version of the resume (not the raw text)"
        ),
      threshold: z
        .number()
        .optional()
        .default(0.9)
        .describe("Similarity score threshold to count as a duplicate"),
    }),
  }
)

export async function storeResume(buffer: Buffer): Promise<void> {
  try {
    await client.connect()
    await client.db("admin").command({ ping: 1 })
    console.log("Successfully connected to MongoDB!")

    const db = client.db("hr_database")
    const collection = db.collection("employees")

    // This opperation assumes ONLY ONE resume being sent at a time
    const newEmployeeData = await convertPDFToData(buffer)
    const summary = await createEmployeeSummary(newEmployeeData[0])

    const result = await duplicateResumeCheckTool.invoke({
      resumeSummary: summary,
    })

    if (result.duplicate) return result

    const recordsWithSummary = {
      pageContent: await createEmployeeSummary(newEmployeeData[0]),
      metadata: { ...newEmployeeData },
    }

    await MongoDBAtlasVectorSearch.fromDocuments(
      [recordsWithSummary],
      new OpenAIEmbeddings(),
      {
        collection,
        indexName: "vector_index",
        textKey: "embedding_text",
        embeddingKey: "embedding",
      }
    )

    console.log(
      "Successfully processed & saved record: ",
      recordsWithSummary.metadata[0].employee_id
    )

    // Utilize this when needing to store mulitple resumes @ the same time
    // const recordsWithSummaries = await Promise.all(
    //   newEmployeeData.map(async (record) => ({
    //     pageContent: await createEmployeeSummary(record),
    //     metadata: { ...record },
    //   }))
    // )

    // for (const record of recordsWithSummaries) {
    //   await MongoDBAtlasVectorSearch.fromDocuments(
    //     [record],
    //     new OpenAIEmbeddings(),
    //     {
    //       collection,
    //       indexName: "vector_index",
    //       textKey: "embedding_text",
    //       embeddingKey: "embedding",
    //     }
    //   )

    //   console.log(
    //     "Successfully processed & saved record:",
    //     record.metadata.employee_id
    //   )
    // }

    console.log("Database entry completed")

    return result
  } catch (error) {
    console.error("Error storing resume in database:", error)
  } finally {
    await client.close()
  }
}
