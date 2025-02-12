'use server'

import { db } from "@/lib/prisma"
import { AnsweredQuestion, Assessment, Question } from "@/types/interview";
import { auth } from "@clerk/nextjs/server"
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
});

export async function generateQuiz() {
    try {
        const {userId} = await auth();
    if(!userId) throw new Error('Unauthorized');

    const user = await db.user.findUnique({
        where:{clerkUserId:userId}
    });

    if(!user) throw new Error("User not found");

    const prompt = `
    Generate 10 technical interview questions for a ${
      user.industry
    } professional${
    user.skills?.length ? ` with expertise in ${user.skills.join(", ")}` : ""
  }.
    
    Each question should be multiple choice with 4 options.
    
    Return the response in this JSON format only, no additional text:
    {
      "questions": [
        {
          "question": "string",
          "options": ["string", "string", "string", "string"],
          "correctAnswer": "string",
          "explanation": "string"
        }
      ]
    }
  `;

    const result = await model.generateContent(prompt);
    const response = result?.response;
    const text = response?.text();

    const cleanedText = text.replace(/```(?:json)?\n?/g, "").trim();
    const quizData = JSON.parse(cleanedText);
    
    return quizData.questions;
    } catch (error) {
        console.error(
            "Error generating Quiz: ",
            (error as Error).message
          );
          throw new Error(
            "Failed to generate Quiz questions " + (error as Error).message
          );
    }
}
export async function saveQuizResult(questions:Question[], answers:string[], score:number): Promise<Assessment> {

    try {
        const {userId} = await auth();
    if(!userId) throw new Error('Unauthorized');

    const user = await db.user.findUnique({
        where:{clerkUserId:userId}
    });

    if(!user) throw new Error("User not found");

    const questionResults = questions.map((item, index:number)=>({
        question: item.question,
        answer: item.correctAnswer,
        userAnswer: answers[index],
        isCorrect: item.correctAnswer === answers[index],
        explanation: item.explanation
    }))

    //collecting wrong answers for generating improvement tips
    const wrongAnswers = questionResults.filter((ques:AnsweredQuestion)=> !ques.isCorrect);

    // generate improvemnet tip if there are any wrong answers
    let improvementsTip ="";
    if(wrongAnswers.length > 0){
        const wrongQuestionsInputString = wrongAnswers.map((q:AnsweredQuestion)=> `Question: "${q.question}"\nCorrect Answer: "${q.answer}"\nUser Answer: "${q.userAnswer}"`).join("\n\n");
        
        const improvementPrompt = `
      The user got the following ${user.industry} technical interview questions wrong:

      ${wrongQuestionsInputString}

      Based on these mistakes, provide a concise, specific improvement tip.
      Focus on the knowledge gaps revealed by these wrong answers.
      Keep the response under 2 sentences and make it encouraging.
      Don't explicitly mention the mistakes, instead focus on what to learn/practice.
    `;

    const tipResult = await model.generateContent(improvementPrompt);

    improvementsTip = tipResult.response.text().trim();
    console.log(improvementsTip);
    }

    const assessment = await db.assessment.create({
        data:{
            userId: user.id,
            quizScore: score,
            questions: questionResults,
            category: "Technical",
            improvementsTip
        }
    })
    // return assessment;
    return {
      id: assessment.id,
      
    userId: assessment.id,
    quizScore: assessment.quizScore,
    questions: (assessment.questions as unknown as AnsweredQuestion[]).map((question)  => ({
      question: question.question || '',
      answer: question.answer || '',
      explanation: question.explanation || '',
      userAnswer: question.userAnswer || '',
      isCorrect: question.isCorrect || false
  })),
    category:assessment.category,
    improvementsTip:String(assessment.improvementsTip),
    createdAt: assessment.createdAt,
    updatedAt: assessment.updatedAt,
    }
        
    } catch (error) {
        console.error("Error saving quiz result:", error);
        throw new Error("Failed to save quiz result"); 
    }
}

export const getAssessments = async()=>{
  try {
    const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  const assessments = await db.assessment.findMany({
    where: {
      userId: user.id,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return assessments;
    
  } catch (error) {
    console.error("Error fetching assessments:", error);
    throw new Error("Failed to fetch assessments");
  }
}