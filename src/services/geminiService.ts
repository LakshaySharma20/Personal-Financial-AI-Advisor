import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface TransactionAnalysis {
  category: string;
  confidence: number;
  reasoning: string;
}

export async function analyzeTransaction(description: string, amount: number): Promise<TransactionAnalysis> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze this transaction: "${description}" for amount ${amount}. Categorize it into one of: Housing, Transportation, Food, Utilities, Healthcare, Insurance, Savings, Debt, Entertainment, Personal, or Other.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          reasoning: { type: Type.STRING },
        },
        required: ["category", "confidence", "reasoning"],
      },
    },
  });

  return JSON.parse(response.text);
}

export async function getFinancialAdvice(transactions: any[], budgets: any[], goals: any[]): Promise<string> {
  const data = JSON.stringify({ transactions, budgets, goals });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are a professional financial advisor. Based on this user's financial data: ${data}, provide 3-5 actionable, personalized pieces of advice to help them save more, invest better, or reach their goals. Keep it concise and encouraging.`,
  });

  return response.text;
}

export async function parseBankStatement(text: string): Promise<any[]> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Extract all transactions from the following bank statement text. For each transaction, identify the date, description, amount, and type (income or expense).
    
    Statement Text:
    ${text}
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING },
            description: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            type: { type: Type.STRING, enum: ["income", "expense"] },
            category: { type: Type.STRING }
          },
          required: ["date", "description", "amount", "type", "category"]
        }
      }
    }
  });

  return JSON.parse(response.text);
}
