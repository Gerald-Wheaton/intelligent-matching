import dotenv from "dotenv"
import express, { Express, Request, Response } from "express"
import { MongoClient } from "mongodb"
import { callAgent } from "./agent"
import cors from "cors"
import multer from "multer"
import { storeResume } from "./store-resume"

dotenv.config()

const app: Express = express()
const client = new MongoClient(process.env.MONGODB_ATLAS_URI as string)

app.use(cors())
app.use(express.json())

const upload = multer({ storage: multer.memoryStorage() })

async function startServer() {
  try {
    await client.connect()
    await client.db("admin").command({ ping: 1 })
    console.log("✅ Connected to MongoDB Atlas")

    // Set up basic Express route
    // curl -X GET http://localhost:3000/
    app.get("/", (req: Request, res: Response) => {
      res.send("LangGraph Agent Server")
    })

    // API endpoint to start a new conversation
    // curl -X POST -H "Content-Type: application/json" -d '{"message": "Build a team to make an iOS app, and tell me the talent gaps."}' http://localhost:3000/chat
    app.post("/chat", async (req: Request, res: Response) => {
      const initialMessage = req.body.message
      const threadId = Date.now().toString() // Simple thread ID generation
      try {
        const response = await callAgent(client, initialMessage, threadId)

        return res.status(200).json({
          status: "success",
          message: "Search processed.",
          result: { threadId, response },
        })
      } catch (error) {
        console.error("Error starting conversation:", error)
        res.status(500).json({ error: "Internal server error" })
      }
    })

    // API endpoint to send a message in an existing conversation
    // curl -X POST -H "Content-Type: application/json" -d '{"message": "What team members did you recommend?"}' http://localhost:3000/chat/123456789
    app.post("/chat/:threadId", async (req: Request, res: Response) => {
      const { threadId } = req.params
      const { message } = req.body
      try {
        const response = await callAgent(client, message, threadId)
        res.json({ response })
      } catch (error) {
        console.error("Error in chat:", error)
        res.status(500).json({ error: "Internal server error" })
      }
    })

    app.post(
      "/api/store-resume",
      upload.single("pdf"),
      async (req: Request, res: Response) => {
        try {
          if (!req.file || req.file.mimetype !== "application/pdf") {
            return res.status(400).json({ message: "No valid PDF uploaded" })
          }

          const buffer = req.file.buffer
          // const employeeData = await convertPDFToData(buffer)

          const result = await storeResume(buffer)

          return res.status(200).json({
            status: "success",
            message: "Resume processed and stored.",
            result: result,
          })
        } catch (error) {
          console.error("Error processing PDF:", error)
          return res.status(500).json({ message: "Failed to process PDF" })
        }
      }
    )

    app.post("/find", async (req: Request, res: Response) => {
      const initialMessage = req.body.message
      const threadId = Date.now().toString() // Simple thread ID generation
      try {
        const response = await callAgent(client, initialMessage, threadId)
        res.json({ threadId, response })
      } catch (error) {
        console.error("Error starting conversation:", error)
        res.status(500).json({ error: "Internal server error" })
      }
    })

    const PORT = process.env.PORT || 3000
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
    })
  } catch (error) {
    console.error("Error connecting to MongoDB:", error)
    process.exit(1)
  }
}

startServer()
