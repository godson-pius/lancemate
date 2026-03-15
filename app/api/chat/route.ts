import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// Initialize Gemini API (Uses GENAI_API_KEY from environment variables instead of Expo config)
const ai = new GoogleGenAI({
  apiKey: process.env.GENAI_API_KEY || "",
});

// Interfaces based on your frontend logic
interface IUser {
  id: string;
  fullname: string;
  business: string;
  email: string;
  contactPhone: string;
  contactAddress: string;
}

// ----------------------------------------------------------------------
// DATA FETCHING STUBS
// Important: Replace these with your actual database queries / ORM calls
// Ensure they use the userId parameter to fetch user-specific data
// ----------------------------------------------------------------------

const getDetailedInvoiceContext = async (userId: string) => {
  console.log("Fetching detailed invoice context for", userId);
  return {
    success: false,
    data: {
      totalUnpaid: 0, overdueCount: 0, pendingCount: 0, invoiceDetails: []
    }
  };
};

const getInvoiceStatsByMonth = async (userId: string, month: number, year: number) => {
  return { success: false, data: { total: 0, paid: 0, pending: 0, overdue: 0, month, year } };
};

const getSalesStatsThisMonth = async (userId: string) => {
  return { success: false, data: { totalSales: 0, count: 0, highestSale: 0 } };
};

const getSalesStatsLastMonth = async (userId: string) => {
  return { success: false, data: { totalSales: 0, count: 0, highestSale: 0, month: new Date().getMonth() - 1 } };
};

const getIncomeByMonth = async (userId: string, month: number, year: number) => {
  return { success: false, data: { totalIncome: 0, count: 0, month, year } };
};

const getIncomeLastNMonths = async (userId: string, months: number) => {
  return { success: false, data: [] };
};

const predictFutureIncome = async (userId: string) => {
  return { success: false, data: { prediction: 0, confidence: "low", averageMonthlyIncome: 0, trend: "stable", growthRate: 0, monthsAnalyzed: 0 } };
};

const getYearToDateIncome = async (userId: string) => {
  return { success: false, data: { totalIncome: 0, count: 0, year: new Date().getFullYear() } };
};

const getInvoiceStats = async (userId: string) => {
  return { success: false, data: { total: 0, paid: 0, pending: 0, overdue: 0 } };
};

const getExpenseStats = async (userId: string) => {
  return { success: false, data: { total: 0, totalAmount: 0, byCategory: {} } };
};

function getMonthName(monthIndex: number) {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return months[monthIndex] || "";
}

// ----------------------------------------------------------------------
// POST HANDLER
// ----------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, user } = body as { prompt: string; user: IUser };

    if (!prompt) {
      return NextResponse.json({ success: false, error: "Prompt is required" }, { status: 400 });
    }

    if (!user || !user.id) {
      return NextResponse.json({ success: false, error: "User object with valid ID is required" }, { status: 401 });
    }

    const currentUser = user;
    const lowerPrompt = prompt.toLowerCase();

    // Helper to return our response shape
    const sendResponse = (text: string) => {
      return NextResponse.json({
        success: true,
        data: {
          prompt,
          response: text,
        }
      });
    };

    // Exclude requests for writing/creating content
    const isWritingRequest = (
      lowerPrompt.includes("write") ||
      lowerPrompt.includes("draft") ||
      lowerPrompt.includes("create a") ||
      lowerPrompt.includes("compose") ||
      lowerPrompt.includes("letter") ||
      lowerPrompt.includes("email") ||
      lowerPrompt.includes("message for") ||
      lowerPrompt.includes("apology") ||
      lowerPrompt.includes("apologies") ||
      lowerPrompt.includes("sorry") ||
      lowerPrompt.includes("reminder for") ||
      lowerPrompt.includes("follow up with") ||
      lowerPrompt.includes("follow-up")
    );

    // ============================================
    // 0. APP NAVIGATION & HOW-TO QUESTIONS
    // ============================================
    const isAskingHowToCreate =
      (lowerPrompt.includes("how") || lowerPrompt.includes("how do i") || lowerPrompt.includes("how can i")) &&
      (lowerPrompt.includes("create") || lowerPrompt.includes("generate") || lowerPrompt.includes("make") || lowerPrompt.includes("add")) &&
      (lowerPrompt.includes("invoice") || lowerPrompt.includes("expense") || lowerPrompt.includes("client"));

    if (isAskingHowToCreate && !isWritingRequest) {
      let response = "";
      if (lowerPrompt.includes("invoice")) {
        response = "To create an invoice:\n\n1. Go to your **Dashboard**\n2. Tap the **'Create'** button or navigate to the **Create** screen\n3. Select **'Create Invoice'**\n4. Fill in the invoice details (client, items, amounts)\n5. Save and send!\n\nWould you like any help with invoice formatting or what to include?";
      } else if (lowerPrompt.includes("expense")) {
        response = "To add an expense:\n\n1. Go to your **Dashboard**\n2. Tap the **'+'** button\n3. Select **'Add Expense'**\n4. Enter the expense details (amount, category, date)\n5. Save it!\n\nKeeping track of expenses helps you understand your spending patterns.";
      }
      if (response) return sendResponse(response);
    }

    const isAskingNavigation =
      lowerPrompt.includes("where") ||
      lowerPrompt.includes("how do i find") ||
      lowerPrompt.includes("how to view") ||
      lowerPrompt.includes("how to see");

    if (isAskingNavigation && !isWritingRequest) {
      let response = "";
      if (lowerPrompt.includes("invoice") && (lowerPrompt.includes("view") || lowerPrompt.includes("see") || lowerPrompt.includes("find"))) {
        response = "To view your invoices:\n\n1. Go to your **Dashboard**\n2. You'll see all your invoices with their status (Paid, Pending, Overdue)\n\nYou can tap on any invoice to see its full details or send it to your client.";
      } else if (lowerPrompt.includes("expense") && (lowerPrompt.includes("view") || lowerPrompt.includes("see") || lowerPrompt.includes("find"))) {
        response = "To view your expenses:\n\n1. Go to your **Dashboard**\n2. Navigate to the **Expenses** tab by clicking on the **'+'** button\n3. You'll see view all expenses\n\nThis helps you monitor your business spending and prepare for tax time!";
      } else if (lowerPrompt.includes("settings") || lowerPrompt.includes("profile")) {
        response = "To access your settings:\n\n1. Go to your **Dashboard**\n2. Look for the **Settings** or **Profile** icon (usually bottom navigation)\n3. There you can update your business details\n\nNeed help with something specific in settings?";
      } else {
        response = "I can help you navigate the app! Could you be more specific about what you're looking for? For example:\n\n- Creating invoices, expenses, or clients\n- Viewing your invoices or expenses\n- Accessing settings\n- Managing your profile\n\nWhat would you like to do?";
      }
      return sendResponse(response);
    }

    // ============================================
    // 1. PRIORITY: UNPAID INVOICES WITH CONTEXT
    // ============================================
    const mentionsUnpaid = lowerPrompt.includes("unpaid") || lowerPrompt.includes("not paid") || lowerPrompt.includes("haven't been paid") || lowerPrompt.includes("not been paid");
    const isAskingAboutUnpaid = mentionsUnpaid && (
      lowerPrompt.includes("how many") || lowerPrompt.includes("do i have") || lowerPrompt.includes("why") ||
      lowerPrompt.includes("reason") || lowerPrompt.includes("what") || lowerPrompt.includes("show") ||
      lowerPrompt.includes("list") || lowerPrompt.includes("tell me about")
    );

    if (isAskingAboutUnpaid && !isWritingRequest) {
      const contextRes = await getDetailedInvoiceContext(currentUser.id);
      if (contextRes.success) {
        const { totalUnpaid, overdueCount, pendingCount, invoiceDetails } = contextRes.data as any;
        const isAskingWhy = lowerPrompt.includes("why") || lowerPrompt.includes("reason") || lowerPrompt.includes("how come");
        const isAskingHowManyUnpaid = lowerPrompt.includes("how many") || lowerPrompt.includes("number of") || lowerPrompt.includes("count") || lowerPrompt.includes("do i have");

        let statsResponse = "";
        if (totalUnpaid === 0) {
          statsResponse = isAskingHowManyUnpaid
            ? "You don't have any unpaid invoices. All your invoices have been paid! 🎉"
            : "You don't have any unpaid invoices. All invoices have been paid. Great job staying on top of your finances! 🎉";
        } else if (totalUnpaid === 1) {
          const inv = invoiceDetails[0];
          if (isAskingHowManyUnpaid) {
            if (inv.isOverdue) statsResponse = `You have 1 unpaid invoice. It's overdue by ${inv.daysOverdue} ${inv.daysOverdue === 1 ? "day" : "days"} for ${inv.clientName}.`;
            else statsResponse = `You have 1 unpaid invoice for ${inv.clientName}. It's due in ${inv.daysTillDue} ${inv.daysTillDue === 1 ? "day" : "days"}.`;
          } else if (inv.isOverdue) {
            statsResponse = `You have one unpaid invoice because it has passed its due date by ${inv.daysOverdue} ${inv.daysOverdue === 1 ? "day" : "days"} and has not yet been paid. This invoice is for ${inv.clientName}. Would you like me to help you draft a follow-up reminder?`;
          } else if (inv.isPending) {
            if (inv.daysTillDue > 0) statsResponse = `You have one unpaid invoice because it was issued recently and has not yet reached its due date (due in ${inv.daysTillDue} ${inv.daysTillDue === 1 ? "day" : "days"}). This is normal, and no action is required right now. The invoice is for ${inv.clientName}.`;
            else statsResponse = `You have one unpaid invoice for ${inv.clientName}. It's currently pending and no action is required yet.`;
          }
        } else {
          const overdueInvoices = invoiceDetails.filter((inv: any) => inv.isOverdue);
          if (isAskingHowManyUnpaid) {
            statsResponse = `You have ${totalUnpaid} unpaid invoices. `;
            if (overdueCount > 0 && pendingCount > 0) statsResponse += `${overdueCount} ${overdueCount === 1 ? 'is' : 'are'} overdue and ${pendingCount} ${pendingCount === 1 ? 'is' : 'are'} pending.`;
            else if (overdueCount > 0) statsResponse += `All ${overdueCount} ${overdueCount === 1 ? 'is' : 'are'} overdue.`;
            else statsResponse += `All ${pendingCount} ${pendingCount === 1 ? 'is' : 'are'} pending.`;
          } else {
            statsResponse = `You have ${totalUnpaid} unpaid invoices. `;
            if (overdueCount > 0 && pendingCount > 0) statsResponse += `${overdueCount} ${overdueCount === 1 ? 'is' : 'are'} overdue and ${pendingCount} ${pendingCount === 1 ? 'is' : 'are'} still pending. `;
            else if (overdueCount > 0) statsResponse += `All ${overdueCount} ${overdueCount === 1 ? 'has' : 'have'} passed their due dates. `;
            else if (pendingCount > 0) statsResponse += `All ${pendingCount} ${pendingCount === 1 ? 'is' : 'are'} still within their payment period. `;

            if (overdueInvoices.length > 0) {
              const mostOverdue = overdueInvoices.reduce((prev: any, current: any) => current.daysOverdue > prev.daysOverdue ? current : prev);
              statsResponse += `The most overdue is for ${mostOverdue.clientName}, which is ${mostOverdue.daysOverdue} ${mostOverdue.daysOverdue === 1 ? "day" : "days"} late. `;
            }
            statsResponse += `Would you like help prioritizing follow-ups?`;
          }
        }
        return sendResponse(statsResponse);
      }
    }

    // ============================================
    // 2. UNPAID INVOICES THIS MONTH
    // ============================================
    const isAskingUnpaidThisMonth = (lowerPrompt.includes("unpaid") || lowerPrompt.includes("not paid")) &&
      (lowerPrompt.includes("this month") || lowerPrompt.includes("current month")) && !isWritingRequest;

    if (isAskingUnpaidThisMonth) {
      const now = new Date();
      const statsRes = await getInvoiceStatsByMonth(currentUser.id, now.getMonth(), now.getFullYear());
      if (statsRes.success) {
        const { pending, overdue } = statsRes.data as any;
        const totalUnpaid = pending + overdue;
        let response = "";
        if (totalUnpaid === 0) response = "Great news! You don't have any unpaid invoices this month. Everything's been paid! 🎉";
        else if (totalUnpaid === 1) response = overdue > 0 ? "You have 1 unpaid invoice this month, and it's overdue. You should follow up on it." : "You have 1 unpaid invoice this month. It's still pending and within its payment period.";
        else {
          response = `You have ${totalUnpaid} unpaid invoices this month. `;
          if (overdue > 0 && pending > 0) response += `${overdue} ${overdue === 1 ? 'is' : 'are'} overdue and ${pending} ${pending === 1 ? 'is' : 'are'} still pending.`;
          else if (overdue > 0) response += `All ${overdue} are overdue and need your attention.`;
          else response += `All ${pending} are still pending.`;
        }
        return sendResponse(response);
      }
    }

    // ============================================
    // 3. INVOICES NEEDING ATTENTION / ACTION ITEMS
    // ============================================
    const isAskingNeedAttention = (
      lowerPrompt.includes("need attention") || lowerPrompt.includes("need my attention") ||
      lowerPrompt.includes("what should i do") || lowerPrompt.includes("next steps") ||
      lowerPrompt.includes("action items") || lowerPrompt.includes("what to do next")
    ) && !isWritingRequest;

    if (isAskingNeedAttention) {
      const contextRes = await getDetailedInvoiceContext(currentUser.id);
      if (contextRes.success) {
        const { totalUnpaid, overdueCount, invoiceDetails } = contextRes.data as any;
        let response = "";
        if (overdueCount === 0 && totalUnpaid === 0) response = "Everything looks good! You don't have any invoices that need immediate attention. All your invoices are paid up. Keep up the great work! 💪";
        else if (overdueCount === 0) response = "Good news - no invoices are overdue right now! All your unpaid invoices are still within their payment period. Just keep an eye on them as they approach their due dates.";
        else {
          const overdueInvoices = invoiceDetails.filter((inv: any) => inv.isOverdue);
          if (overdueCount === 1) {
            const inv = overdueInvoices[0];
            response = `You have 1 invoice that needs attention. It's overdue by ${inv.daysOverdue} ${inv.daysOverdue === 1 ? "day" : "days"} for ${inv.clientName}. I'd recommend sending a polite follow-up reminder as soon as possible.`;
          } else {
            overdueInvoices.sort((a: any, b: any) => b.daysOverdue - a.daysOverdue);
            response = `You have ${overdueCount} overdue invoices that need your attention:\n\n`;
            overdueInvoices.slice(0, 3).forEach((inv: any, idx: number) => {
              response += `${idx + 1}. ${inv.clientName} - ${inv.daysOverdue} ${inv.daysOverdue === 1 ? "day" : "days"} overdue\n`;
            });
            if (overdueCount > 3) response += `\n...and ${overdueCount - 3} more.\n`;
            response += `\nI recommend prioritizing the most overdue invoices and sending follow-up reminders today.`;
          }
        }
        return sendResponse(response);
      }
    }

    // ============================================
    // 4. OVERDUE CHECK
    // ============================================
    const isAskingOverdue = ((lowerPrompt.includes("overdue") || lowerPrompt.includes("late") || lowerPrompt.includes("past due")) && !lowerPrompt.includes("how many")) && !isWritingRequest;

    if (isAskingOverdue) {
      const contextRes = await getDetailedInvoiceContext(currentUser.id);
      if (contextRes.success) {
        const { overdueCount, invoiceDetails } = contextRes.data as any;
        let response = "";
        if (overdueCount === 0) response = "No, you don't have any overdue invoices at the moment. Everything's on track! 👍";
        else if (overdueCount === 1) {
          const inv = invoiceDetails.find((i: any) => i.isOverdue);
          if (inv) response = `Yes, you have 1 overdue invoice. It's ${inv.daysOverdue} ${inv.daysOverdue === 1 ? "day" : "days"} past due for ${inv.clientName}. Consider following up soon.`;
        } else {
          const overdueInvoices = invoiceDetails.filter((inv: any) => inv.isOverdue);
          const mostOverdue = overdueInvoices.reduce((prev: any, current: any) => current.daysOverdue > prev.daysOverdue ? current : prev);
          response = `Yes, you have ${overdueCount} overdue invoices. The most overdue is for ${mostOverdue.clientName}, which is ${mostOverdue.daysOverdue} ${mostOverdue.daysOverdue === 1 ? "day" : "days"} late. Would you like help drafting follow-up messages?`;
        }
        return sendResponse(response);
      }
    }

    // ============================================
    // 5. PERFORMANCE SUMMARY
    // ============================================
    const isAskingPerformance = (lowerPrompt.includes("how am i doing") || lowerPrompt.includes("how's it going") ||
      lowerPrompt.includes("summarise") || lowerPrompt.includes("summarize") || lowerPrompt.includes("summary") ||
      (lowerPrompt.includes("performance") && lowerPrompt.includes("invoice"))) && !isWritingRequest;

    if (isAskingPerformance) {
      const now = new Date();
      const statsRes = await getInvoiceStatsByMonth(currentUser.id, now.getMonth(), now.getFullYear());
      const salesRes = await getSalesStatsThisMonth(currentUser.id);
      if (statsRes.success) {
        const { total, paid, pending, overdue } = statsRes.data as any;
        const monthName = getMonthName(now.getMonth());
        let response = `Here's how you're doing in ${monthName}:\n\n`;
        if (total === 0) response += "You haven't created any invoices this month yet. Ready to get started?";
        else {
          response += `📊 You've created ${total} invoice${total === 1 ? '' : 's'} this month.\n\n`;
          if (paid > 0) response += `✅ ${paid} paid (${Math.round((paid / total) * 100)}%)\n`;
          if (pending > 0) response += `⏳ ${pending} pending\n`;
          if (overdue > 0) response += `⚠️ ${overdue} overdue\n\n`;
          if (salesRes.success && (salesRes.data as any).totalSales > 0) {
            const formatted = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 }).format((salesRes.data as any).totalSales);
            response += `💰 Total revenue: ${formatted}\n\n`;
          }
          if (overdue > 0) response += `You have some overdue invoices that need attention. Focus on following up with those clients.`;
          else if (pending > 0 && paid > 0) response += `You're doing well! Most invoices are either paid or on track. Keep it up!`;
          else if (paid === total) response += `Excellent! All your invoices are paid. You're crushing it! 🎉`;
          else response += `Things are looking good. Keep monitoring those pending invoices.`;
        }
        return sendResponse(response);
      }
    }

    // ============================================
    // INCOME SPECIFIC MONTH
    // ============================================
    const isAskingIncomeSpecificMonth = ((lowerPrompt.includes("income") || lowerPrompt.includes("revenue") || lowerPrompt.includes("earned") || lowerPrompt.includes("made")) &&
      (lowerPrompt.includes("last month") || lowerPrompt.includes("previous month") ||
        lowerPrompt.includes("january") || lowerPrompt.includes("february") || lowerPrompt.includes("march") ||
        lowerPrompt.includes("april") || lowerPrompt.includes("may") || lowerPrompt.includes("june") ||
        lowerPrompt.includes("july") || lowerPrompt.includes("august") || lowerPrompt.includes("september") ||
        lowerPrompt.includes("october") || lowerPrompt.includes("november") || lowerPrompt.includes("december"))) && !isWritingRequest;

    if (isAskingIncomeSpecificMonth) {
      const now = new Date();
      let targetMonth: number;
      let targetYear: number;
      if (lowerPrompt.includes("last month") || lowerPrompt.includes("previous month")) {
        targetMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        targetYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      } else {
        const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
        targetMonth = monthNames.findIndex(m => lowerPrompt.includes(m));
        targetYear = targetMonth > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
      }
      const incomeRes = await getIncomeByMonth(currentUser.id, targetMonth, targetYear);
      if (incomeRes.success && incomeRes.data) {
        const { totalIncome, count, month, year } = incomeRes.data as any;
        const formatted = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 }).format(totalIncome);
        const monthName = getMonthName(month);
        let response = "";
        if (count === 0 || totalIncome === 0) {
          response = `You didn't record any income in ${monthName} ${year}. `;
          if (month === now.getMonth() - 1 || (month === 11 && now.getMonth() === 0)) response += "Hopefully this month will be better!";
        } else {
          response = `In ${monthName} ${year}, you earned ${formatted} from ${count} paid invoice${count === 1 ? '' : 's'}. `;
          if (totalIncome > 5000) response += "That was a great month! 💪";
          else if (totalIncome > 2000) response += "Nice work!";
        }
        return sendResponse(response);
      }
    }

    // ============================================
    // INCOME HISTORY LAST N MONTHS
    // ============================================
    const isAskingIncomeHistory = ((lowerPrompt.includes("income") || lowerPrompt.includes("revenue") || lowerPrompt.includes("earnings")) &&
      (lowerPrompt.includes("last") || lowerPrompt.includes("past") || lowerPrompt.includes("history") || lowerPrompt.includes("over time")) &&
      (lowerPrompt.includes("months") || lowerPrompt.includes("3 months") || lowerPrompt.includes("6 months"))) && !isWritingRequest;

    if (isAskingIncomeHistory) {
      let numberOfMonths = 6;
      if (lowerPrompt.includes("3 months") || lowerPrompt.includes("three months")) numberOfMonths = 3;
      else if (lowerPrompt.includes("12 months") || lowerPrompt.includes("year")) numberOfMonths = 12;

      const historyRes = await getIncomeLastNMonths(currentUser.id, numberOfMonths);
      if (historyRes.success && historyRes.data) {
        const monthlyData = historyRes.data as any[];
        let response = `Here's your income over the last ${numberOfMonths} months:\n\n`;
        monthlyData.forEach((month) => {
          const formatted = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 }).format(month.totalIncome);
          response += `**${month.monthName} ${month.year}**: ${formatted}${month.count > 0 ? ` (${month.count} invoice${month.count === 1 ? '' : 's'})` : ''}\n`;
        });
        const total = monthlyData.reduce((sum, m) => sum + m.totalIncome, 0);
        const average = total / numberOfMonths;
        const formattedTotal = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 }).format(total);
        const formattedAvg = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 }).format(average);
        response += `\n**Total**: ${formattedTotal}\n**Average per month**: ${formattedAvg}`;
        return sendResponse(response);
      }
    }

    // ============================================
    // INCOME PREDICTION
    // ============================================
    const isAskingPrediction = ((lowerPrompt.includes("predict") || lowerPrompt.includes("forecast") || lowerPrompt.includes("expect") || lowerPrompt.includes("estimate") ||
      lowerPrompt.includes("will i make") || lowerPrompt.includes("can i make") || lowerPrompt.includes("how much will i") || lowerPrompt.includes("next month")) &&
      (lowerPrompt.includes("income") || lowerPrompt.includes("revenue") || lowerPrompt.includes("earn") || lowerPrompt.includes("make"))) && !isWritingRequest;

    if (isAskingPrediction) {
      const predictionRes = await predictFutureIncome(currentUser.id);
      if (predictionRes.success && predictionRes.data) {
        const { prediction, confidence, averageMonthlyIncome, trend, growthRate, monthsAnalyzed = 0 } = predictionRes.data as any;
        const formatted = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 }).format(prediction);
        const avgFormatted = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 }).format(averageMonthlyIncome);
        let response = "";
        if (monthsAnalyzed === 0) response = "I don't have enough data to make a prediction yet. Start tracking your income, and I'll be able to forecast your future earnings!";
        else if (monthsAnalyzed < 3) response = `Based on your limited income history (${monthsAnalyzed} month${monthsAnalyzed === 1 ? '' : 's'}), I predict you could earn around ${formatted} next month. However, this is a low-confidence prediction. Track more months for better accuracy!`;
        else {
          response = `Based on ${monthsAnalyzed} months of data, I predict you'll earn approximately ${formatted} next month.\n\n📊 **Analysis**:\n• Your average monthly income: ${avgFormatted}\n`;
          if (trend === "increasing") response += `• Trend: Growing ${Math.abs(growthRate ?? 0).toFixed(1)}% 📈\n• Your income is trending upward!\n`;
          else if (trend === "decreasing") response += `• Trend: Declining ${Math.abs(growthRate ?? 0).toFixed(1)}% 📉\n• Consider strategies to boost your income.\n`;
          else response += `• Trend: Stable\n• Your income is consistent.\n`;
          response += `• Confidence: ${confidence.charAt(0).toUpperCase() + confidence.slice(1)}\n\n`;
          if (confidence === "high") response += "This prediction is based on solid historical data!";
          else if (confidence === "medium") response += "Track a few more months for even better predictions!";
        }
        return sendResponse(response);
      }
    }

    // ============================================
    // YEAR TO DATE INCOME
    // ============================================
    const isAskingYTD = ((lowerPrompt.includes("year to date") || lowerPrompt.includes("ytd") || lowerPrompt.includes("this year") || lowerPrompt.includes("so far this year")) &&
      (lowerPrompt.includes("income") || lowerPrompt.includes("revenue") || lowerPrompt.includes("earned"))) && !isWritingRequest;

    if (isAskingYTD) {
      const ytdRes = await getYearToDateIncome(currentUser.id);
      if (ytdRes.success && ytdRes.data) {
        const { totalIncome, count, year } = ytdRes.data as any;
        const formatted = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 }).format(totalIncome);
        let response = "";
        if (count === 0 || totalIncome === 0) response = `You haven't recorded any income in ${year} yet. Time to get those invoices out there!`;
        else {
          response = `Your year-to-date income for ${year} is ${formatted} from ${count} paid invoice${count === 1 ? '' : 's'}. `;
          const avgFormatted = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 }).format(totalIncome / (new Date().getMonth() + 1));
          response += `That's an average of ${avgFormatted} per month. `;
          if (totalIncome > 50000) response += "Fantastic year so far! 🎉";
          else if (totalIncome > 20000) response += "You're doing great! Keep it up! 💪";
        }
        return sendResponse(response);
      }
    }

    // ============================================
    // 6. TOTAL INCOME RECEIVED
    // ============================================
    const isAskingIncome = ((lowerPrompt.includes("income") || lowerPrompt.includes("revenue") || lowerPrompt.includes("received")) &&
      (lowerPrompt.includes("total") || lowerPrompt.includes("how much") || lowerPrompt.includes("so far"))) && !isWritingRequest;

    if (isAskingIncome) {
      const salesRes = await getSalesStatsThisMonth(currentUser.id);
      if (salesRes.success && salesRes.data) {
        const { totalSales, count } = salesRes.data as any;
        const formatted = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 }).format(totalSales);
        let response = "";
        if (count === 0 || totalSales === 0) response = "You haven't received any income this month yet. Hopefully some invoices will be paid soon!";
        else {
          response = `So far in ${getMonthName(new Date().getMonth())}, you've received ${formatted} from ${count} paid invoice${count === 1 ? '' : 's'}. `;
          if (totalSales > 5000) response += "Great month! 💪";
          else if (totalSales > 2000) response += "Keep it going!";
        }
        return sendResponse(response);
      }
    }

    // ============================================
    // 7. TOTAL OUTSTANDING AMOUNT
    // ============================================
    const isAskingOutstanding = ((lowerPrompt.includes("outstanding") || lowerPrompt.includes("owed") || lowerPrompt.includes("awaiting")) &&
      (lowerPrompt.includes("amount") || lowerPrompt.includes("total") || lowerPrompt.includes("how much"))) && !isWritingRequest;

    if (isAskingOutstanding) {
      const contextRes = await getDetailedInvoiceContext(currentUser.id);
      if (contextRes.success) {
        const unpaidInvoices = (contextRes.data as any).invoiceDetails.filter((inv: any) => inv.isOverdue || inv.isPending);
        const totalOutstanding = unpaidInvoices.reduce((sum: number, inv: any) => sum + inv.total, 0);
        const formatted = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 }).format(totalOutstanding);
        let response = "";
        if (totalOutstanding === 0) response = "You don't have any outstanding amounts. All invoices are paid up! 🎉";
        else {
          response = `Your total outstanding amount is ${formatted} across ${unpaidInvoices.length} invoice${unpaidInvoices.length === 1 ? '' : 's'}. `;
          const overdueAmount = unpaidInvoices.filter((inv: any) => inv.isOverdue).reduce((sum: number, inv: any) => sum + inv.total, 0);
          if (overdueAmount > 0) response += `${new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 }).format(overdueAmount)} of this is overdue and needs immediate attention.`;
          else response += "All unpaid invoices are still within their payment period.";
        }
        return sendResponse(response);
      }
    }

    // ============================================
    // 8. INVOICES CLOSE TO DUE DATE
    // ============================================
    const isAskingCloseToDue = (lowerPrompt.includes("close to") || lowerPrompt.includes("approaching") || lowerPrompt.includes("due soon") || (lowerPrompt.includes("due date") && lowerPrompt.includes("near"))) && !isWritingRequest;
    if (isAskingCloseToDue) {
      const contextRes = await getDetailedInvoiceContext(currentUser.id);
      if (contextRes.success) {
        const dueSoon = (contextRes.data as any).invoiceDetails.filter((inv: any) => inv.isPending && inv.daysTillDue <= 7 && inv.daysTillDue >= 0);
        let response = "";
        if (dueSoon.length === 0) response = "No invoices are close to their due date right now. You have some breathing room! 😊";
        else if (dueSoon.length === 1) response = `1 invoice is close to its due date: ${dueSoon[0].clientName}'s invoice is due in ${dueSoon[0].daysTillDue} ${dueSoon[0].daysTillDue === 1 ? "day" : "days"}.`;
        else {
          dueSoon.sort((a: any, b: any) => a.daysTillDue - b.daysTillDue);
          response = `${dueSoon.length} invoices are approaching their due dates:\n\n`;
          dueSoon.slice(0, 3).forEach((inv: any, idx: number) => { response += `${idx + 1}. ${inv.clientName} - due in ${inv.daysTillDue} ${inv.daysTillDue === 1 ? "day" : "days"}\n`; });
          if (dueSoon.length > 3) response += `\n...and ${dueSoon.length - 3} more.`;
        }
        return sendResponse(response);
      }
    }

    // ============================================
    // 9. AT RISK OF LATE PAYMENT
    // ============================================
    const isAskingRisk = (lowerPrompt.includes("at risk") || lowerPrompt.includes("late payment") || lowerPrompt.includes("might be late")) && !isWritingRequest;
    if (isAskingRisk) {
      const contextRes = await getDetailedInvoiceContext(currentUser.id);
      if (contextRes.success) {
        const atRisk = (contextRes.data as any).invoiceDetails.filter((inv: any) => inv.isOverdue || (inv.isPending && inv.daysTillDue <= 3));
        let response = "";
        if (atRisk.length === 0) response = "Good news! No invoices are at risk of late payment right now. Everything's looking stable.";
        else {
          response = `${atRisk.length} invoice${atRisk.length === 1 ? ' is' : 's are'} at risk:\n\n`;
          atRisk.slice(0, 3).forEach((inv: any, idx: number) => {
            if (inv.isOverdue) response += `${idx + 1}. ${inv.clientName} - already ${inv.daysOverdue} ${inv.daysOverdue === 1 ? "day" : "days"} overdue ⚠️\n`;
            else response += `${idx + 1}. ${inv.clientName} - due in ${inv.daysTillDue} ${inv.daysTillDue === 1 ? "day" : "days"}\n`;
          });
          if (atRisk.length > 3) response += `\n...and ${atRisk.length - 3} more.`;
          response += `\n\nConsider sending gentle reminders to these clients.`;
        }
        return sendResponse(response);
      }
    }

    // ============================================
    // 10. INVOICES DUE TODAY
    // ============================================
    const isAskingDueToday = (lowerPrompt.includes("due today") || (lowerPrompt.includes("today") && (lowerPrompt.includes("due") || lowerPrompt.includes("invoice")))) && !isWritingRequest;
    if (isAskingDueToday) {
      const contextRes = await getDetailedInvoiceContext(currentUser.id);
      if (contextRes.success) {
        const dueToday = (contextRes.data as any).invoiceDetails.filter((inv: any) => inv.isPending && inv.daysTillDue === 0);
        let response = "";
        if (dueToday.length === 0) response = "No, you don't have any invoices due today. You're all clear! ✨";
        else if (dueToday.length === 1) response = `Yes, you have 1 invoice due today for ${dueToday[0].clientName} (${new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(dueToday[0].total)}). You might want to send a gentle reminder if they haven't paid yet.`;
        else {
          response = `You have ${dueToday.length} invoices due today:\n\n`;
          dueToday.forEach((inv: any, idx: number) => { response += `${idx + 1}. ${inv.clientName} - ${new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(inv.total)}\n`; });
          response += `\nConsider sending polite payment reminders to these clients.`;
        }
        return sendResponse(response);
      }
    }

    // ============================================
    // 11. DAYS LEFT BEFORE DUE
    // ============================================
    const isAskingDaysLeft = (lowerPrompt.includes("days left") || lowerPrompt.includes("days until") || lowerPrompt.includes("how many days") || (lowerPrompt.includes("when") && lowerPrompt.includes("due"))) && !isWritingRequest;
    if (isAskingDaysLeft) {
      const contextRes = await getDetailedInvoiceContext(currentUser.id);
      if (contextRes.success) {
        const pendingInvoices = (contextRes.data as any).invoiceDetails.filter((inv: any) => inv.isPending);
        let response = "";
        if (pendingInvoices.length === 0) response = "You don't have any pending invoices with upcoming due dates.";
        else if (pendingInvoices.length === 1) response = `Your unpaid invoice for ${pendingInvoices[0].clientName} is due in ${pendingInvoices[0].daysTillDue} ${pendingInvoices[0].daysTillDue === 1 ? "day" : "days"}.`;
        else {
          pendingInvoices.sort((a: any, b: any) => a.daysTillDue - b.daysTillDue);
          response = `Here's when your unpaid invoices are due:\n\n`;
          pendingInvoices.forEach((inv: any, idx: number) => { response += `${idx + 1}. ${inv.clientName} - ${inv.daysTillDue} ${inv.daysTillDue === 1 ? "day" : "days"}\n`; });
        }
        return sendResponse(response);
      }
    }

    // ============================================
    // 12. GENERAL INVOICE STATS
    // ============================================
    const isInvoiceQuery = lowerPrompt.includes("invoice") || lowerPrompt.includes("pending") || lowerPrompt.includes("overdue") || lowerPrompt.includes("paid");
    const isAskingForStats = (lowerPrompt.includes("how many") || lowerPrompt.includes("number of") || lowerPrompt.includes("get total") || lowerPrompt.includes("count of") || lowerPrompt.includes("total invoice") || lowerPrompt.includes("total invoices") || lowerPrompt.includes("do i have") || lowerPrompt.includes("show me") || lowerPrompt.includes("list"));
    if (isInvoiceQuery && isAskingForStats && !isWritingRequest) {
      const mentionsPending = lowerPrompt.includes("pending");
      const mentionsOverdue = lowerPrompt.includes("overdue");
      const mentionsPaid = lowerPrompt.includes("paid") || lowerPrompt.includes("completed");
      const mentionsLastMonth = lowerPrompt.includes("last month");
      const mentionsThisMonth = lowerPrompt.includes("this month");

      let statsRes: any;
      if (mentionsLastMonth) {
        const now = new Date();
        statsRes = await getInvoiceStatsByMonth(currentUser.id, now.getMonth() === 0 ? 11 : now.getMonth() - 1, now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
      } else if (mentionsThisMonth) {
        const now = new Date();
        statsRes = await getInvoiceStatsByMonth(currentUser.id, now.getMonth(), now.getFullYear());
      } else {
        statsRes = await getInvoiceStats(currentUser.id);
      }

      if (statsRes.success) {
        const { total, paid, pending, overdue, month, year } = statsRes.data as any;
        const monthPrefix = month !== undefined ? `In ${getMonthName(month)} ${year}, you ` : "You ";
        let statsResponse = "";

        if (mentionsPending && !mentionsOverdue && !mentionsPaid) {
          if (pending === 0) statsResponse = `${monthPrefix}don't have any pending invoices${month !== undefined ? " from that month" : " at the moment"}. Everything's either paid or overdue.`;
          else if (pending === 1) statsResponse = `${monthPrefix}have 1 invoice that's still pending. Would you like me to help you follow up on it?`;
          else statsResponse = `${monthPrefix}have ${pending} invoices pending. Let me know if you'd like to review any of them!`;
        } else if (mentionsOverdue && !mentionsPending && !mentionsPaid) {
          if (overdue === 0) statsResponse = `Good news - ${monthPrefix.toLowerCase()}don't have any overdue invoices${month !== undefined ? " from that month" : ""}! Everything's on track.`;
          else if (overdue === 1) statsResponse = `${monthPrefix}have 1 overdue invoice that needs attention. Would you like help following up on it?`;
          else statsResponse = `Heads up - ${monthPrefix.toLowerCase()}have ${overdue} overdue invoices that might need your attention. Want to prioritize these?`;
        } else if (mentionsPaid && !mentionsPending && !mentionsOverdue) {
          if (paid === 0) statsResponse = `${monthPrefix}haven't received any payments yet${month !== undefined ? " from that month" : ""}. Hopefully some invoices will be paid soon!`;
          else if (paid === 1) statsResponse = `${monthPrefix}have 1 paid invoice${month !== undefined ? " from that month" : ""}. Nice! Keep the momentum going.`;
          else statsResponse = `Looking good! ${monthPrefix}have ${paid} paid invoices${month !== undefined ? " from that month" : ""}. That's money in the bank!`;
        } else {
          const summary = [];
          if (total === 0) statsResponse = `${monthPrefix}don't have any invoices${month !== undefined ? ` from ${getMonthName(month)} ${year}` : " in the system yet"}. ${month === undefined ? "Ready to create your first one?" : ""}`;
          else {
            if (paid > 0) summary.push(`${paid} paid`);
            if (pending > 0) summary.push(`${pending} pending`);
            if (overdue > 0) summary.push(`${overdue} overdue`);
            statsResponse = `${month !== undefined ? `In ${getMonthName(month)} ${year}, you had` : "You have"} ${total} invoice${total === 1 ? "" : "s"}${month !== undefined ? "" : " in total"} - ${summary.join(", ")}.`;
            if (overdue > 0 && month === undefined) statsResponse += ` You might want to follow up on those overdue ones!`;
            else if (pending > 0 && month === undefined) statsResponse += ` Things are looking good!`;
          }
        }
        return sendResponse(statsResponse);
      }
    }

    // ============================================
    // 13. EXPENSE STATS
    // ============================================
    const isExpenseQuery = lowerPrompt.includes("expense") || lowerPrompt.includes("expenses") || lowerPrompt.includes("spend") || lowerPrompt.includes("spent") || lowerPrompt.includes("cost");
    const isAskingAboutExpenses = lowerPrompt.includes("how much") || lowerPrompt.includes("how many") || lowerPrompt.includes("total") || lowerPrompt.includes("show") || lowerPrompt.includes("list") || lowerPrompt.includes("what are");
    if (isExpenseQuery && isAskingAboutExpenses && !isWritingRequest) {
      const statsRes = await getExpenseStats(currentUser.id);
      if (statsRes.success) {
        const { total, totalAmount, byCategory } = statsRes.data as any;
        let statsResponse = "";
        if (total === 0) statsResponse = "You haven't tracked any expenses yet. Want to add some to keep better tabs on your spending?";
        else {
          statsResponse = `You've recorded ${total} ${total === 1 ? "expense" : "expenses"} so far, totaling ${new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(totalAmount)}.`;
          const categoryEntries = Object.entries(byCategory) as [string, number][];
          if (categoryEntries.length > 0) {
            const topCategories = categoryEntries.sort((a, b) => b[1] - a[1]).slice(0, 3);
            if (topCategories.length === 1) statsResponse += ` All your spending is in ${topCategories[0][0]} (${new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(topCategories[0][1])}).`;
            else statsResponse += ` Your biggest spending areas are ${topCategories.map(([c, a]) => `${c} (${new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(a)})`).join(", ")}.`;
          }
        }
        return sendResponse(statsResponse);
      }
    }

    // ============================================
    // 14. PROFILE INFO
    // ============================================
    const isProfileQuery = lowerPrompt.includes("profile") || lowerPrompt.includes("my details") || lowerPrompt.includes("my info") || lowerPrompt.includes("account") || lowerPrompt.includes("business") || lowerPrompt.includes("contact");
    const isAskingAboutProfile = lowerPrompt.includes("what") || lowerPrompt.includes("show") || lowerPrompt.includes("tell me") || lowerPrompt.includes("display") || lowerPrompt.includes("view");
    if (isProfileQuery && isAskingAboutProfile && !isWritingRequest) {
      return sendResponse(`Here's what I have on file for you:\n\n**${currentUser.fullname}**\n${currentUser.business}\n\n📧 ${currentUser.email}\n📞 ${currentUser.contactPhone}\n📍 ${currentUser.contactAddress}\n\nNeed to update anything?`);
    }

    // ============================================
    // 15. SALES/REVENUE STATS
    // ============================================
    const isSalesQuery = lowerPrompt.includes("sale") || lowerPrompt.includes("sales") || lowerPrompt.includes("revenue");
    const isAskingAboutSales = lowerPrompt.includes("biggest") || lowerPrompt.includes("highest") || lowerPrompt.includes("largest") || lowerPrompt.includes("how much") || lowerPrompt.includes("how many") || lowerPrompt.includes("total") || lowerPrompt.includes("this month") || lowerPrompt.includes("last month");
    if (isSalesQuery && isAskingAboutSales && !isWritingRequest) {
      const isAskingBiggest = lowerPrompt.includes("biggest") || lowerPrompt.includes("highest") || lowerPrompt.includes("largest");
      const mentionsThisMonth = lowerPrompt.includes("this month") || lowerPrompt.includes("current month");
      const mentionsLastMonth = lowerPrompt.includes("last month");
      let statsRes: any;
      let monthName = "";
      if (mentionsLastMonth) {
        statsRes = await getSalesStatsLastMonth(currentUser.id);
        if (statsRes.success && statsRes.data.month !== undefined) monthName = getMonthName(statsRes.data.month);
      } else {
        statsRes = await getSalesStatsThisMonth(currentUser.id);
        monthName = getMonthName(new Date().getMonth());
      }

      if (statsRes.success) {
        const { highestSale, totalSales, count } = statsRes.data;
        const format = (amount: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
        let statsResponse = "";
        if (count === 0) statsResponse = `You haven't recorded any sales${mentionsLastMonth || mentionsThisMonth ? ` in ${monthName}` : " this month"} yet. ${!mentionsLastMonth ? "It's still early - let's make it a great month!" : ""}`;
        else if (isAskingBiggest) statsResponse = `Your biggest sale${mentionsLastMonth || mentionsThisMonth ? ` in ${monthName}` : " this month"} is ${format(highestSale)}. Nice work!`;
        else {
          statsResponse = `${mentionsLastMonth || mentionsThisMonth ? `In ${monthName}` : "This month"} you${mentionsLastMonth ? "" : "'ve"} made ${count} ${count === 1 ? "sale" : "sales"} totaling ${format(totalSales)}.`;
          if (count > 5 && !mentionsLastMonth) statsResponse += " You're on a roll!";
          else if (count === 1 && !mentionsLastMonth) statsResponse += " First one down - keep going!";
        }
        return sendResponse(statsResponse);
      }
    }

    // ============================================
    // FALLBACK: AI RESPONSE
    // ============================================
    const enhancedPrompt = `You are a helpful business assistant for ${currentUser?.fullname || "the user"} who runs ${currentUser?.business || "a business"}. Answer their question in a friendly, conversational way. Keep responses concise and helpful.

User's question: ${prompt}`;

    try {
      const aiResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: enhancedPrompt,
        config: {
          systemInstruction: `You are a helpful AI assistant for FreelanceMate, an AI-powered mobile app designed for UK freelancers.
Your role is to help users with:
- Creating/managing invoices, expenses
- Answering finance, business, freelancing questions
- Drafting professional emails/reminders
Tone: Friendly, professional, concise.`
        }
      });
      return sendResponse(aiResponse.text as string);
    } catch (aiError) {
      console.error("AI Generation Error", aiError);
      return NextResponse.json({ success: false, error: "Failed to generate AI response" }, { status: 500 });
    }

  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
