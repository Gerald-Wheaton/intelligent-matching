import { z } from "zod"
import { EmployeeSchema } from "./schema"
import { StructuredOutputParser } from "@langchain/core/output_parsers"
import { ChatOpenAI } from "@langchain/openai"
import pdfParse from "pdf-parse"

const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0.7,
})

type Employee = z.infer<typeof EmployeeSchema>
const parser = StructuredOutputParser.fromZodSchema(z.array(EmployeeSchema))

export async function convertPDFToData(buffer: Buffer): Promise<Employee[]> {
  const parsed = await pdfParse(buffer)
  const resumeText = parsed.text.trim()

  const prompt = `You are a helpful assistant that generates employee data. Generate 1 employee record from the resume that is provided. This record should include the following fields: employee_id, first_name, last_name, date_of_birth, address, contact_details, job_details, work_location, reporting_manager, skills, performance_reviews, benefits, emergency_contact, notes. If no data is included on the resume that matches a given field that I asked for, include the field but leave it blank.

    Resume: ${resumeText}

    ${parser.getFormatInstructions()}`

  console.log("Generating employee data from Resume PDF...")

  const response = await llm.invoke(prompt)
  return parser.parse(response.content as string)
}
