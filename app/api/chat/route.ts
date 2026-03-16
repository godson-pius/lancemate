import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import {
  addChat,
  getDetailedInvoiceContext,
  getExpenseStats,
  getIncomeByMonth,
  getIncomeLastNMonths,
  getInvoiceStats,
  getInvoiceStatsByMonth,
  getMonthName,
  getSalesStatsLastMonth,
  getSalesStatsThisMonth,
  getYearToDateIncome,
  predictFutureIncome,
} from "@/lib/firestore";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatRequestBody {
  prompt: string;
  user?: {
    id: string;
    fullname: string;
    business: string;
    email: string;
    contactPhone: string;
    contactAddress: string;
  };
}

interface InvoiceDetail {
  id: string;
  status: string;
  total: number;
  clientName: string;
  daysOverdue: number;
  daysTillDue: number;
  isOverdue: boolean;
  isPending: boolean;
}

interface InvoiceContext {
  totalUnpaid: number;
  overdueCount: number;
  pendingCount: number;
  invoiceDetails: InvoiceDetail[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatGBP(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(amount);
}

function buildConversationEntry(
  userId: string,
  prompt: string,
  response: string
) {
  return {
    id: Math.random().toString(),
    userId,
    prompt,
    response,
    createdAt: "",
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body: ChatRequestBody = await req.json();
    const { prompt, user } = body;

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const lowerPrompt = prompt.toLowerCase();
    const userId = user?.id ?? "anonymous";

    // ── Writing-request guard ─────────────────────────────────────────────────
    const isWritingRequest =
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
      lowerPrompt.includes("follow-up");

    // ── Utility: save & return ────────────────────────────────────────────────
    async function respond(response: string) {
      const data = buildConversationEntry(userId, prompt, response);
      await addChat(data);
      return NextResponse.json({ response, conversation: data });
    }

    // =========================================================================
    // 0. APP NAVIGATION & HOW-TO QUESTIONS
    // =========================================================================
    const isAskingHowToCreate =
      (lowerPrompt.includes("how") ||
        lowerPrompt.includes("how do i") ||
        lowerPrompt.includes("how can i")) &&
      (lowerPrompt.includes("create") ||
        lowerPrompt.includes("generate") ||
        lowerPrompt.includes("make") ||
        lowerPrompt.includes("add")) &&
      (lowerPrompt.includes("invoice") ||
        lowerPrompt.includes("expense") ||
        lowerPrompt.includes("client"));

    if (isAskingHowToCreate && !isWritingRequest) {
      let response = "";
      if (lowerPrompt.includes("invoice")) {
        response =
          "To create an invoice:\n\n1. Go to your **Dashboard**\n2. Tap the **'Create'** button or navigate to the **Create** screen\n3. Select **'Create Invoice'**\n4. Fill in the invoice details (client, items, amounts)\n5. Save and send!\n\nWould you like any help with invoice formatting or what to include?";
      } else if (lowerPrompt.includes("expense")) {
        response =
          "To add an expense:\n\n1. Go to your **Dashboard**\n2. Tap the **'+'** button\n3. Select **'Add Expense'**\n4. Enter the expense details (amount, category, date)\n5. Save it!\n\nKeeping track of expenses helps you understand your spending patterns.";
      }
      if (response) return respond(response);
    }

    const isAskingNavigation =
      lowerPrompt.includes("where") ||
      lowerPrompt.includes("how do i find") ||
      lowerPrompt.includes("how to view") ||
      lowerPrompt.includes("how to see");

    if (isAskingNavigation && !isWritingRequest) {
      let response = "";
      if (
        lowerPrompt.includes("invoice") &&
        (lowerPrompt.includes("view") ||
          lowerPrompt.includes("see") ||
          lowerPrompt.includes("find"))
      ) {
        response =
          "To view your invoices:\n\n1. Go to your **Dashboard**\n2. You'll see all your invoices with their status (Paid, Pending, Overdue)\n\nYou can tap on any invoice to see its full details or send it to your client.";
      } else if (
        lowerPrompt.includes("expense") &&
        (lowerPrompt.includes("view") ||
          lowerPrompt.includes("see") ||
          lowerPrompt.includes("find"))
      ) {
        response =
          "To view your expenses:\n\n1. Go to your **Dashboard**\n2. Navigate to the **Expenses** tab by clicking on the **'+'** button\n3. You'll see view all expenses\n\nThis helps you monitor your business spending and prepare for tax time!";
      } else if (
        lowerPrompt.includes("settings") ||
        lowerPrompt.includes("profile")
      ) {
        response =
          "To access your settings:\n\n1. Go to your **Dashboard**\n2. Look for the **Settings** or **Profile** icon (usually bottom navigation)\n3. There you can update your business details\n\nNeed help with something specific in settings?";
      } else {
        response =
          "I can help you navigate the app! Could you be more specific about what you're looking for? For example:\n\n- Creating invoices, expenses, or expenses\n- Viewing your invoices or expenses\n- Accessing settings\n- Managing your profile\n\nWhat would you like to do?";
      }
      if (response) return respond(response);
    }

    // =========================================================================
    // 1. UNPAID INVOICES WITH CONTEXT
    // =========================================================================
    const mentionsUnpaid =
      lowerPrompt.includes("unpaid") ||
      lowerPrompt.includes("not paid") ||
      lowerPrompt.includes("haven't been paid") ||
      lowerPrompt.includes("not been paid");

    const isAskingAboutUnpaid =
      mentionsUnpaid &&
      (lowerPrompt.includes("how many") ||
        lowerPrompt.includes("do i have") ||
        lowerPrompt.includes("why") ||
        lowerPrompt.includes("reason") ||
        lowerPrompt.includes("what") ||
        lowerPrompt.includes("show") ||
        lowerPrompt.includes("list") ||
        lowerPrompt.includes("tell me about"));

    if (isAskingAboutUnpaid && !isWritingRequest) {
      const contextRes = await getDetailedInvoiceContext(userId);
      if (contextRes.success) {
        const { totalUnpaid, overdueCount, pendingCount, invoiceDetails } =
          contextRes.data as unknown as InvoiceContext;

        const isAskingWhy =
          lowerPrompt.includes("why") ||
          lowerPrompt.includes("reason") ||
          lowerPrompt.includes("how come");

        const isAskingHowManyUnpaid =
          lowerPrompt.includes("how many") ||
          lowerPrompt.includes("number of") ||
          lowerPrompt.includes("count") ||
          lowerPrompt.includes("do i have");

        let response = "";

        if (totalUnpaid === 0) {
          response = isAskingHowManyUnpaid
            ? "You don't have any unpaid invoices. All your invoices have been paid! 🎉"
            : "You don't have any unpaid invoices. All invoices have been paid. Great job staying on top of your finances! 🎉";
        } else if (totalUnpaid === 1) {
          const inv = invoiceDetails[0];
          if (isAskingHowManyUnpaid) {
            if (inv.isOverdue) {
              const dayText = inv.daysOverdue === 1 ? "day" : "days";
              response = `You have 1 unpaid invoice. It's overdue by ${inv.daysOverdue} ${dayText} for ${inv.clientName}.`;
            } else {
              const dayText = inv.daysTillDue === 1 ? "day" : "days";
              response = `You have 1 unpaid invoice for ${inv.clientName}. It's due in ${inv.daysTillDue} ${dayText}.`;
            }
          } else if (inv.isOverdue) {
            const dayText = inv.daysOverdue === 1 ? "day" : "days";
            response = `You have one unpaid invoice because it has passed its due date by ${inv.daysOverdue} ${dayText} and has not yet been paid. This invoice is for ${inv.clientName}. Would you like me to help you draft a follow-up reminder?`;
          } else if (inv.isPending) {
            if (inv.daysTillDue > 0) {
              const dayText = inv.daysTillDue === 1 ? "day" : "days";
              response = `You have one unpaid invoice because it was issued recently and has not yet reached its due date (due in ${inv.daysTillDue} ${dayText}). This is normal, and no action is required right now. The invoice is for ${inv.clientName}.`;
            } else {
              response = `You have one unpaid invoice for ${inv.clientName}. It's currently pending and no action is required yet.`;
            }
          }
        } else {
          const overdueInvoices = invoiceDetails.filter((inv) => inv.isOverdue);

          if (isAskingHowManyUnpaid) {
            response = `You have ${totalUnpaid} unpaid invoices. `;
            if (overdueCount > 0 && pendingCount > 0) {
              response += `${overdueCount} ${overdueCount === 1 ? "is" : "are"} overdue and ${pendingCount} ${pendingCount === 1 ? "is" : "are"} pending.`;
            } else if (overdueCount > 0) {
              response += `All ${overdueCount} ${overdueCount === 1 ? "is" : "are"} overdue.`;
            } else {
              response += `All ${pendingCount} ${pendingCount === 1 ? "is" : "are"} pending.`;
            }
          } else {
            response = `You have ${totalUnpaid} unpaid invoices. `;
            if (overdueCount > 0 && pendingCount > 0) {
              response += `${overdueCount} ${overdueCount === 1 ? "is" : "are"} overdue and ${pendingCount} ${pendingCount === 1 ? "is" : "are"} still pending. `;
            } else if (overdueCount > 0) {
              response += `All ${overdueCount} ${overdueCount === 1 ? "has" : "have"} passed their due dates. `;
            } else if (pendingCount > 0) {
              response += `All ${pendingCount} ${pendingCount === 1 ? "is" : "are"} still within their payment period. `;
            }
            if (overdueInvoices.length > 0) {
              const mostOverdue = overdueInvoices.reduce((prev, current) =>
                current.daysOverdue > prev.daysOverdue ? current : prev
              );
              const dayText = mostOverdue.daysOverdue === 1 ? "day" : "days";
              response += `The most overdue is for ${mostOverdue.clientName}, which is ${mostOverdue.daysOverdue} ${dayText} late. `;
            }
            response += `Would you like help prioritizing follow-ups?`;
          }
        }

        if (response) return respond(response);
      }
    }

    // =========================================================================
    // 2. UNPAID INVOICES THIS MONTH
    // =========================================================================
    const isAskingUnpaidThisMonth =
      (lowerPrompt.includes("unpaid") || lowerPrompt.includes("not paid")) &&
      (lowerPrompt.includes("this month") ||
        lowerPrompt.includes("current month")) &&
      !isWritingRequest;

    if (isAskingUnpaidThisMonth) {
      const now = new Date();
      const statsRes = await getInvoiceStatsByMonth(
        userId,
        now.getMonth(),
        now.getFullYear()
      );
      if (statsRes.success) {
        const { pending, overdue } = statsRes.data as {
          total: number;
          paid: number;
          pending: number;
          overdue: number;
          month: number;
          year: number;
        };
        const totalUnpaid = pending + overdue;
        let response = "";
        if (totalUnpaid === 0) {
          response =
            "Great news! You don't have any unpaid invoices this month. Everything's been paid! 🎉";
        } else if (totalUnpaid === 1) {
          response =
            overdue > 0
              ? "You have 1 unpaid invoice this month, and it's overdue. You should follow up on it."
              : "You have 1 unpaid invoice this month. It's still pending and within its payment period.";
        } else {
          response = `You have ${totalUnpaid} unpaid invoices this month. `;
          if (overdue > 0 && pending > 0) {
            response += `${overdue} ${overdue === 1 ? "is" : "are"} overdue and ${pending} ${pending === 1 ? "is" : "are"} still pending.`;
          } else if (overdue > 0) {
            response += `All ${overdue} are overdue and need your attention.`;
          } else {
            response += `All ${pending} are still pending.`;
          }
        }
        return respond(response);
      }
    }

    // =========================================================================
    // 3. INVOICES NEEDING ATTENTION
    // =========================================================================
    const isAskingNeedAttention =
      (lowerPrompt.includes("need attention") ||
        lowerPrompt.includes("need my attention") ||
        lowerPrompt.includes("what should i do") ||
        lowerPrompt.includes("next steps") ||
        lowerPrompt.includes("action items") ||
        lowerPrompt.includes("what to do next")) &&
      !isWritingRequest;

    if (isAskingNeedAttention) {
      const contextRes = await getDetailedInvoiceContext(userId);
      if (contextRes.success) {
        const { totalUnpaid, overdueCount, invoiceDetails } =
          contextRes.data as unknown as InvoiceContext;
        const overdueInvoices = invoiceDetails.filter((inv) => inv.isOverdue);
        let response = "";

        if (overdueCount === 0 && totalUnpaid === 0) {
          response =
            "Everything looks good! You don't have any invoices that need immediate attention. All your invoices are paid up. Keep up the great work! 💪";
        } else if (overdueCount === 0) {
          response =
            "Good news - no invoices are overdue right now! All your unpaid invoices are still within their payment period. Just keep an eye on them as they approach their due dates.";
        } else if (overdueCount === 1) {
          const inv = overdueInvoices[0];
          const dayText = inv.daysOverdue === 1 ? "day" : "days";
          response = `You have 1 invoice that needs attention. It's overdue by ${inv.daysOverdue} ${dayText} for ${inv.clientName}. I'd recommend sending a polite follow-up reminder as soon as possible.`;
        } else {
          overdueInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue);
          response = `You have ${overdueCount} overdue invoices that need your attention:\n\n`;
          overdueInvoices.slice(0, 3).forEach((inv, idx) => {
            const dayText = inv.daysOverdue === 1 ? "day" : "days";
            response += `${idx + 1}. ${inv.clientName} - ${inv.daysOverdue} ${dayText} overdue\n`;
          });
          if (overdueCount > 3) response += `\n...and ${overdueCount - 3} more.\n`;
          response += `\nI recommend prioritizing the most overdue invoices and sending follow-up reminders today.`;
        }

        return respond(response);
      }
    }

    // =========================================================================
    // 4. OVERDUE CHECK
    // =========================================================================
    const isAskingOverdue =
      (lowerPrompt.includes("overdue") ||
        lowerPrompt.includes("late") ||
        lowerPrompt.includes("past due")) &&
      !lowerPrompt.includes("how many") &&
      !isWritingRequest;

    if (isAskingOverdue) {
      const contextRes = await getDetailedInvoiceContext(userId);
      if (contextRes.success) {
        const { overdueCount, invoiceDetails } =
          contextRes.data as unknown as InvoiceContext;
        let response = "";

        if (overdueCount === 0) {
          response =
            "No, you don't have any overdue invoices at the moment. Everything's on track! 👍";
        } else if (overdueCount === 1) {
          const inv = invoiceDetails.find((i) => i.isOverdue);
          if (inv) {
            const dayText = inv.daysOverdue === 1 ? "day" : "days";
            response = `Yes, you have 1 overdue invoice. It's ${inv.daysOverdue} ${dayText} past due for ${inv.clientName}. Consider following up soon.`;
          }
        } else {
          const overdueInvoices = invoiceDetails.filter((inv) => inv.isOverdue);
          const mostOverdue = overdueInvoices.reduce((prev, current) =>
            current.daysOverdue > prev.daysOverdue ? current : prev
          );
          const dayText = mostOverdue.daysOverdue === 1 ? "day" : "days";
          response = `Yes, you have ${overdueCount} overdue invoices. The most overdue is for ${mostOverdue.clientName}, which is ${mostOverdue.daysOverdue} ${dayText} late. Would you like help drafting follow-up messages?`;
        }

        if (response) return respond(response);
      }
    }

    // =========================================================================
    // 5. PERFORMANCE SUMMARY
    // =========================================================================
    const isAskingPerformance =
      (lowerPrompt.includes("how am i doing") ||
        lowerPrompt.includes("how's it going") ||
        lowerPrompt.includes("summarise") ||
        lowerPrompt.includes("summarize") ||
        lowerPrompt.includes("summary") ||
        (lowerPrompt.includes("performance") &&
          lowerPrompt.includes("invoice"))) &&
      !isWritingRequest;

    if (isAskingPerformance) {
      const now = new Date();
      const [statsRes, salesRes] = await Promise.all([
        getInvoiceStatsByMonth(userId, now.getMonth(), now.getFullYear()),
        getSalesStatsThisMonth(userId),
      ]);

      if (statsRes.success) {
        const { total, paid, pending, overdue } = statsRes.data as {
          total: number;
          paid: number;
          pending: number;
          overdue: number;
        };
        const monthName = getMonthName(now.getMonth());
        let response = `Here's how you're doing in ${monthName}:\n\n`;

        if (total === 0) {
          response +=
            "You haven't created any invoices this month yet. Ready to get started?";
        } else {
          response += `📊 You've created ${total} invoice${total === 1 ? "" : "s"} this month.\n\n`;
          if (paid > 0) response += `✅ ${paid} paid (${Math.round((paid / total) * 100)}%)\n`;
          if (pending > 0) response += `⏳ ${pending} pending\n`;
          if (overdue > 0) response += `⚠️ ${overdue} overdue\n`;
          response += "\n";

          if (salesRes.success && (salesRes.data?.totalSales ?? 0) > 0) {
            response += `💰 Total revenue: ${formatGBP(salesRes.data?.totalSales ?? 0)}\n\n`;
          }

          if (overdue > 0) {
            response += `You have some overdue invoices that need attention. Focus on following up with those clients.`;
          } else if (pending > 0 && paid > 0) {
            response += `You're doing well! Most invoices are either paid or on track. Keep it up!`;
          } else if (paid === total) {
            response += `Excellent! All your invoices are paid. You're crushing it! 🎉`;
          } else {
            response += `Things are looking good. Keep monitoring those pending invoices.`;
          }
        }

        return respond(response);
      }
    }

    // =========================================================================
    // INCOME: SPECIFIC MONTH
    // =========================================================================
    const isAskingIncomeSpecificMonth =
      (lowerPrompt.includes("income") ||
        lowerPrompt.includes("revenue") ||
        lowerPrompt.includes("earned") ||
        lowerPrompt.includes("made")) &&
      (lowerPrompt.includes("last month") ||
        lowerPrompt.includes("previous month") ||
        ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].some((m) =>
          lowerPrompt.includes(m)
        )) &&
      !isWritingRequest;

    if (isAskingIncomeSpecificMonth) {
      const now = new Date();
      let targetMonth: number;
      let targetYear: number;

      if (lowerPrompt.includes("last month") || lowerPrompt.includes("previous month")) {
        targetMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        targetYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      } else {
        const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
        targetMonth = monthNames.findIndex((m) => lowerPrompt.includes(m));
        targetYear = now.getFullYear();
        if (targetMonth > now.getMonth()) targetYear = now.getFullYear() - 1;
      }

      const incomeRes = await getIncomeByMonth(userId, targetMonth, targetYear);
      if (incomeRes.success && incomeRes.data) {
        const { totalIncome, count, month, year } = incomeRes.data;
        const monthName = getMonthName(month);
        let response = "";

        if (count === 0 || totalIncome === 0) {
          response = `You didn't record any income in ${monthName} ${year}. `;
          if (month === now.getMonth() - 1 || (month === 11 && now.getMonth() === 0)) {
            response += "Hopefully this month will be better!";
          }
        } else {
          response = `In ${monthName} ${year}, you earned ${formatGBP(totalIncome)} from ${count} paid invoice${count === 1 ? "" : "s"}. `;
          if (totalIncome > 5000) response += "That was a great month! 💪";
          else if (totalIncome > 2000) response += "Nice work!";
        }

        return respond(response);
      }
    }

    // =========================================================================
    // INCOME: HISTORY / LAST N MONTHS
    // =========================================================================
    const isAskingIncomeHistory =
      (lowerPrompt.includes("income") ||
        lowerPrompt.includes("revenue") ||
        lowerPrompt.includes("earnings")) &&
      (lowerPrompt.includes("last") ||
        lowerPrompt.includes("past") ||
        lowerPrompt.includes("history") ||
        lowerPrompt.includes("over time")) &&
      (lowerPrompt.includes("months") ||
        lowerPrompt.includes("3 months") ||
        lowerPrompt.includes("6 months")) &&
      !isWritingRequest;

    if (isAskingIncomeHistory) {
      let numberOfMonths = 6;
      if (lowerPrompt.includes("3 months") || lowerPrompt.includes("three months")) numberOfMonths = 3;
      else if (lowerPrompt.includes("12 months") || lowerPrompt.includes("year")) numberOfMonths = 12;

      const historyRes = await getIncomeLastNMonths(userId, numberOfMonths);
      if (historyRes.success && historyRes.data) {
        const monthlyData = historyRes.data;
        let response = `Here's your income over the last ${numberOfMonths} months:\n\n`;

        monthlyData.forEach((month: any) => {
          response += `**${month.monthName} ${month.year}**: ${formatGBP(month.totalIncome)}`;
          if (month.count > 0) response += ` (${month.count} invoice${month.count === 1 ? "" : "s"})`;
          response += `\n`;
        });

        const total = monthlyData.reduce((sum: number, m: any) => sum + m.totalIncome, 0);
        response += `\n**Total**: ${formatGBP(total)}\n`;
        response += `**Average per month**: ${formatGBP(total / numberOfMonths)}`;

        return respond(response);
      }
    }

    // =========================================================================
    // INCOME: PREDICTION
    // =========================================================================
    const isAskingPrediction =
      (lowerPrompt.includes("predict") ||
        lowerPrompt.includes("forecast") ||
        lowerPrompt.includes("expect") ||
        lowerPrompt.includes("estimate") ||
        lowerPrompt.includes("will i make") ||
        lowerPrompt.includes("can i make") ||
        lowerPrompt.includes("how much will i") ||
        lowerPrompt.includes("next month")) &&
      (lowerPrompt.includes("income") ||
        lowerPrompt.includes("revenue") ||
        lowerPrompt.includes("earn") ||
        lowerPrompt.includes("make")) &&
      !isWritingRequest;

    if (isAskingPrediction) {
      const predictionRes = await predictFutureIncome(userId);
      if (predictionRes.success && predictionRes.data) {
        const {
          prediction,
          confidence,
          averageMonthlyIncome,
          trend,
          growthRate,
          monthsAnalyzed = 0,
        } = predictionRes.data;

        let response = "";
        if (monthsAnalyzed === 0) {
          response =
            "I don't have enough data to make a prediction yet. Start tracking your income, and I'll be able to forecast your future earnings!";
        } else if (monthsAnalyzed < 3) {
          response = `Based on your limited income history (${monthsAnalyzed} month${monthsAnalyzed === 1 ? "" : "s"}), I predict you could earn around ${formatGBP(prediction)} next month. However, this is a low-confidence prediction. Track more months for better accuracy!`;
        } else {
          response = `Based on ${monthsAnalyzed} months of data, I predict you'll earn approximately ${formatGBP(prediction)} next month.\n\n`;
          response += `📊 **Analysis**:\n`;
          response += `• Your average monthly income: ${formatGBP(averageMonthlyIncome)}\n`;
          if (trend === "increasing") {
            response += `• Trend: Growing ${Math.abs(growthRate ?? 0).toFixed(1)}% 📈\n• Your income is trending upward!\n`;
          } else if (trend === "decreasing") {
            response += `• Trend: Declining ${Math.abs(growthRate ?? 0).toFixed(1)}% 📉\n• Consider strategies to boost your income.\n`;
          } else {
            response += `• Trend: Stable\n• Your income is consistent.\n`;
          }
          response += `• Confidence: ${confidence.charAt(0).toUpperCase() + confidence.slice(1)}\n\n`;
          if (confidence === "high") response += "This prediction is based on solid historical data!";
          else if (confidence === "medium") response += "Track a few more months for even better predictions!";
        }

        return respond(response);
      }
    }

    // =========================================================================
    // INCOME: YEAR TO DATE
    // =========================================================================
    const isAskingYTD =
      (lowerPrompt.includes("year to date") ||
        lowerPrompt.includes("ytd") ||
        lowerPrompt.includes("this year") ||
        lowerPrompt.includes("so far this year")) &&
      (lowerPrompt.includes("income") ||
        lowerPrompt.includes("revenue") ||
        lowerPrompt.includes("earned")) &&
      !isWritingRequest;

    if (isAskingYTD) {
      const ytdRes = await getYearToDateIncome(userId);
      if (ytdRes.success && ytdRes.data) {
        const { totalIncome, count, year } = ytdRes.data;
        let response = "";

        if (count === 0 || totalIncome === 0) {
          response = `You haven't recorded any income in ${year} yet. Time to get those invoices out there!`;
        } else {
          const now = new Date();
          const monthsPassed = now.getMonth() + 1;
          response = `Your year-to-date income for ${year} is ${formatGBP(totalIncome)} from ${count} paid invoice${count === 1 ? "" : "s"}. `;
          response += `That's an average of ${formatGBP(totalIncome / monthsPassed)} per month. `;
          if (totalIncome > 50000) response += "Fantastic year so far! 🎉";
          else if (totalIncome > 20000) response += "You're doing great! Keep it up! 💪";
        }

        return respond(response);
      }
    }

    // =========================================================================
    // INCOME: TOTAL THIS MONTH
    // =========================================================================
    const isAskingIncome =
      (lowerPrompt.includes("income") ||
        lowerPrompt.includes("revenue") ||
        lowerPrompt.includes("received")) &&
      (lowerPrompt.includes("total") ||
        lowerPrompt.includes("how much") ||
        lowerPrompt.includes("so far")) &&
      !isWritingRequest;

    if (isAskingIncome) {
      const now = new Date();
      const salesRes = await getSalesStatsThisMonth(userId);
      if (salesRes.success && salesRes.data) {
        const { totalSales, count } = salesRes.data;
        let response = "";

        if (count === 0 || totalSales === 0) {
          response =
            "You haven't received any income this month yet. Hopefully some invoices will be paid soon!";
        } else {
          const monthName = getMonthName(now.getMonth());
          response = `So far in ${monthName}, you've received ${formatGBP(totalSales)} from ${count} paid invoice${count === 1 ? "" : "s"}. `;
          if (totalSales > 5000) response += "Great month! 💪";
          else if (totalSales > 2000) response += "Keep it going!";
        }

        return respond(response);
      }
    }

    // =========================================================================
    // OUTSTANDING AMOUNT
    // =========================================================================
    const isAskingOutstanding =
      (lowerPrompt.includes("outstanding") ||
        lowerPrompt.includes("owed") ||
        lowerPrompt.includes("awaiting")) &&
      (lowerPrompt.includes("amount") ||
        lowerPrompt.includes("total") ||
        lowerPrompt.includes("how much")) &&
      !isWritingRequest;

    if (isAskingOutstanding) {
      const contextRes = await getDetailedInvoiceContext(userId);
      if (contextRes.success) {
        const { invoiceDetails } = contextRes.data as unknown as InvoiceContext;
        const unpaidInvoices = invoiceDetails.filter(
          (inv) => inv.isOverdue || inv.isPending
        );
        const totalOutstanding = unpaidInvoices.reduce(
          (sum, inv) => sum + inv.total,
          0
        );
        let response = "";

        if (totalOutstanding === 0) {
          response =
            "You don't have any outstanding amounts. All invoices are paid up! 🎉";
        } else {
          response = `Your total outstanding amount is ${formatGBP(totalOutstanding)} across ${unpaidInvoices.length} invoice${unpaidInvoices.length === 1 ? "" : "s"}. `;
          const overdueAmount = unpaidInvoices
            .filter((inv) => inv.isOverdue)
            .reduce((sum, inv) => sum + inv.total, 0);
          if (overdueAmount > 0) {
            response += `${formatGBP(overdueAmount)} of this is overdue and needs immediate attention.`;
          } else {
            response += "All unpaid invoices are still within their payment period.";
          }
        }

        return respond(response);
      }
    }

    // =========================================================================
    // INVOICES CLOSE TO DUE
    // =========================================================================
    const isAskingCloseToDue =
      (lowerPrompt.includes("close to") ||
        lowerPrompt.includes("approaching") ||
        lowerPrompt.includes("due soon") ||
        (lowerPrompt.includes("due date") && lowerPrompt.includes("near"))) &&
      !isWritingRequest;

    if (isAskingCloseToDue) {
      const contextRes = await getDetailedInvoiceContext(userId);
      if (contextRes.success) {
        const { invoiceDetails } = contextRes.data as unknown as InvoiceContext;
        const dueSoon = invoiceDetails.filter(
          (inv) => inv.isPending && inv.daysTillDue <= 7 && inv.daysTillDue >= 0
        );
        let response = "";

        if (dueSoon.length === 0) {
          response =
            "No invoices are close to their due date right now. You have some breathing room! 😊";
        } else if (dueSoon.length === 1) {
          const inv = dueSoon[0];
          const dayText = inv.daysTillDue === 1 ? "day" : "days";
          response = `1 invoice is close to its due date: ${inv.clientName}'s invoice is due in ${inv.daysTillDue} ${dayText}.`;
        } else {
          dueSoon.sort((a, b) => a.daysTillDue - b.daysTillDue);
          response = `${dueSoon.length} invoices are approaching their due dates:\n\n`;
          dueSoon.slice(0, 3).forEach((inv, idx) => {
            const dayText = inv.daysTillDue === 1 ? "day" : "days";
            response += `${idx + 1}. ${inv.clientName} - due in ${inv.daysTillDue} ${dayText}\n`;
          });
          if (dueSoon.length > 3) response += `\n...and ${dueSoon.length - 3} more.`;
        }

        return respond(response);
      }
    }

    // =========================================================================
    // AT RISK OF LATE PAYMENT
    // =========================================================================
    const isAskingRisk =
      (lowerPrompt.includes("at risk") ||
        lowerPrompt.includes("late payment") ||
        lowerPrompt.includes("might be late")) &&
      !isWritingRequest;

    if (isAskingRisk) {
      const contextRes = await getDetailedInvoiceContext(userId);
      if (contextRes.success) {
        const { invoiceDetails } = contextRes.data as unknown as InvoiceContext;
        const atRisk = invoiceDetails.filter(
          (inv) =>
            inv.isOverdue || (inv.isPending && inv.daysTillDue <= 3)
        );
        let response = "";

        if (atRisk.length === 0) {
          response =
            "Good news! No invoices are at risk of late payment right now. Everything's looking stable.";
        } else {
          response = `${atRisk.length} invoice${atRisk.length === 1 ? " is" : "s are"} at risk:\n\n`;
          atRisk.slice(0, 3).forEach((inv, idx) => {
            if (inv.isOverdue) {
              const dayText = inv.daysOverdue === 1 ? "day" : "days";
              response += `${idx + 1}. ${inv.clientName} - already ${inv.daysOverdue} ${dayText} overdue ⚠️\n`;
            } else {
              const dayText = inv.daysTillDue === 1 ? "day" : "days";
              response += `${idx + 1}. ${inv.clientName} - due in ${inv.daysTillDue} ${dayText}\n`;
            }
          });
          if (atRisk.length > 3) response += `\n...and ${atRisk.length - 3} more.`;
          response += `\n\nConsider sending gentle reminders to these clients.`;
        }

        return respond(response);
      }
    }

    // =========================================================================
    // INVOICES DUE TODAY
    // =========================================================================
    const isAskingDueToday =
      (lowerPrompt.includes("due today") ||
        (lowerPrompt.includes("today") &&
          (lowerPrompt.includes("due") || lowerPrompt.includes("invoice")))) &&
      !isWritingRequest;

    if (isAskingDueToday) {
      const contextRes = await getDetailedInvoiceContext(userId);
      if (contextRes.success) {
        const { invoiceDetails } = contextRes.data as unknown as InvoiceContext;
        const dueToday = invoiceDetails.filter(
          (inv) => inv.isPending && inv.daysTillDue === 0
        );
        let response = "";

        if (dueToday.length === 0) {
          response = "No, you don't have any invoices due today. You're all clear! ✨";
        } else if (dueToday.length === 1) {
          const inv = dueToday[0];
          response = `Yes, you have 1 invoice due today for ${inv.clientName} (${formatGBP(inv.total)}). You might want to send a gentle reminder if they haven't paid yet.`;
        } else {
          response = `You have ${dueToday.length} invoices due today:\n\n`;
          dueToday.forEach((inv, idx) => {
            response += `${idx + 1}. ${inv.clientName} - ${formatGBP(inv.total)}\n`;
          });
          response += `\nConsider sending polite payment reminders to these clients.`;
        }

        return respond(response);
      }
    }

    // =========================================================================
    // DAYS LEFT BEFORE DUE
    // =========================================================================
    const isAskingDaysLeft =
      (lowerPrompt.includes("days left") ||
        lowerPrompt.includes("days until") ||
        lowerPrompt.includes("how many days") ||
        (lowerPrompt.includes("when") && lowerPrompt.includes("due"))) &&
      !isWritingRequest;

    if (isAskingDaysLeft) {
      const contextRes = await getDetailedInvoiceContext(userId);
      if (contextRes.success) {
        const { invoiceDetails } = contextRes.data as unknown as InvoiceContext;
        const pendingInvoices = invoiceDetails.filter((inv) => inv.isPending);
        let response = "";

        if (pendingInvoices.length === 0) {
          response = "You don't have any pending invoices with upcoming due dates.";
        } else if (pendingInvoices.length === 1) {
          const inv = pendingInvoices[0];
          const dayText = inv.daysTillDue === 1 ? "day" : "days";
          response = `Your unpaid invoice for ${inv.clientName} is due in ${inv.daysTillDue} ${dayText}.`;
        } else {
          pendingInvoices.sort((a, b) => a.daysTillDue - b.daysTillDue);
          response = `Here's when your unpaid invoices are due:\n\n`;
          pendingInvoices.forEach((inv, idx) => {
            const dayText = inv.daysTillDue === 1 ? "day" : "days";
            response += `${idx + 1}. ${inv.clientName} - ${inv.daysTillDue} ${dayText}\n`;
          });
        }

        return respond(response);
      }
    }

    // =========================================================================
    // GENERAL INVOICE STATS
    // =========================================================================
    const isInvoiceQuery =
      lowerPrompt.includes("invoice") ||
      lowerPrompt.includes("pending") ||
      lowerPrompt.includes("overdue") ||
      lowerPrompt.includes("paid");

    const isAskingForStats =
      lowerPrompt.includes("how many") ||
      lowerPrompt.includes("number of") ||
      lowerPrompt.includes("get total") ||
      lowerPrompt.includes("count of") ||
      lowerPrompt.includes("total invoice") ||
      lowerPrompt.includes("total invoices") ||
      lowerPrompt.includes("do i have") ||
      lowerPrompt.includes("show me") ||
      lowerPrompt.includes("list");

    if (isInvoiceQuery && isAskingForStats && !isWritingRequest) {
      const mentionsPending = lowerPrompt.includes("pending");
      const mentionsOverdue = lowerPrompt.includes("overdue");
      const mentionsPaid =
        lowerPrompt.includes("paid") || lowerPrompt.includes("completed");
      const mentionsLastMonth = lowerPrompt.includes("last month");
      const mentionsThisMonth = lowerPrompt.includes("this month");

      let statsRes;
      if (mentionsLastMonth) {
        const now = new Date();
        const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const lastMonthYear =
          now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        statsRes = await getInvoiceStatsByMonth(userId, lastMonth, lastMonthYear);
      } else if (mentionsThisMonth) {
        const now = new Date();
        statsRes = await getInvoiceStatsByMonth(userId, now.getMonth(), now.getFullYear());
      } else {
        statsRes = await getInvoiceStats(userId);
      }

      if (statsRes.success) {
        const { total, paid, pending, overdue, month, year } =
          statsRes.data as {
            total: number;
            paid: number;
            pending: number;
            overdue: number;
            month?: number;
            year?: number;
          };
        const monthPrefix =
          month !== undefined ? `In ${getMonthName(month)} ${year}, you ` : "You ";
        let statsResponse = "";

        if (mentionsPending && !mentionsOverdue && !mentionsPaid) {
          if (pending === 0) {
            statsResponse = `${monthPrefix}don't have any pending invoices${month !== undefined ? " from that month" : " at the moment"}. Everything's either paid or overdue.`;
          } else if (pending === 1) {
            statsResponse = `${monthPrefix}have 1 invoice that's still pending. Would you like me to help you follow up on it?`;
          } else {
            statsResponse = `${monthPrefix}have ${pending} invoices pending. Let me know if you'd like to review any of them!`;
          }
        } else if (mentionsOverdue && !mentionsPending && !mentionsPaid) {
          if (overdue === 0) {
            statsResponse = `Good news - ${monthPrefix.toLowerCase()}don't have any overdue invoices${month !== undefined ? " from that month" : ""}! Everything's on track.`;
          } else if (overdue === 1) {
            statsResponse = `${monthPrefix}have 1 overdue invoice that needs attention. Would you like help following up on it?`;
          } else {
            statsResponse = `Heads up - ${monthPrefix.toLowerCase()}have ${overdue} overdue invoices that might need your attention. Want to prioritize these?`;
          }
        } else if (mentionsPaid && !mentionsPending && !mentionsOverdue) {
          if (paid === 0) {
            statsResponse = `${monthPrefix}haven't received any payments yet${month !== undefined ? " from that month" : ""}. Hopefully some invoices will be paid soon!`;
          } else if (paid === 1) {
            statsResponse = `${monthPrefix}have 1 paid invoice${month !== undefined ? " from that month" : ""}. Nice! Keep the momentum going.`;
          } else {
            statsResponse = `Looking good! ${monthPrefix}have ${paid} paid invoices${month !== undefined ? " from that month" : ""}. That's money in the bank!`;
          }
        } else {
          if (total === 0) {
            statsResponse = `${monthPrefix}don't have any invoices${month !== undefined ? ` from ${getMonthName(month)} ${year}` : " in the system yet"}. ${month === undefined ? "Ready to create your first one?" : ""}`;
          } else {
            const summary = [];
            if (paid > 0) summary.push(`${paid} paid`);
            if (pending > 0) summary.push(`${pending} pending`);
            if (overdue > 0) summary.push(`${overdue} overdue`);
            statsResponse = `${month !== undefined ? `In ${getMonthName(month)} ${year}, you had` : "You have"} ${total} invoice${total === 1 ? "" : "s"}${month !== undefined ? "" : " in total"} - ${summary.join(", ")}.`;
            if (overdue > 0 && month === undefined) {
              statsResponse += ` You might want to follow up on those overdue ones!`;
            } else if (pending > 0 && month === undefined) {
              statsResponse += ` Things are looking good!`;
            }
          }
        }

        return respond(statsResponse);
      }
    }

    // =========================================================================
    // EXPENSE STATS
    // =========================================================================
    const isExpenseQuery =
      lowerPrompt.includes("expense") ||
      lowerPrompt.includes("expenses") ||
      lowerPrompt.includes("spend") ||
      lowerPrompt.includes("spent") ||
      lowerPrompt.includes("cost");

    const isAskingAboutExpenses =
      lowerPrompt.includes("how much") ||
      lowerPrompt.includes("how many") ||
      lowerPrompt.includes("total") ||
      lowerPrompt.includes("show") ||
      lowerPrompt.includes("list") ||
      lowerPrompt.includes("what are");

    if (isExpenseQuery && isAskingAboutExpenses && !isWritingRequest) {
      const statsRes = await getExpenseStats(userId);
      if (statsRes.success) {
        const { total, totalAmount, byCategory } = statsRes.data as {
          total: number;
          totalAmount: number;
          byCategory: Record<string, number>;
        };
        let statsResponse = "";

        if (total === 0) {
          statsResponse =
            "You haven't tracked any expenses yet. Want to add some to keep better tabs on your spending?";
        } else {
          const expenseWord = total === 1 ? "expense" : "expenses";
          statsResponse = `You've recorded ${total} ${expenseWord} so far, totaling ${formatGBP(totalAmount)}.`;
          const categoryEntries = Object.entries(byCategory);
          if (categoryEntries.length > 0) {
            const topCategories = categoryEntries
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3);
            if (topCategories.length === 1) {
              const [category, amount] = topCategories[0];
              statsResponse += ` All your spending is in ${category} (${formatGBP(amount)}).`;
            } else {
              const categoryList = topCategories
                .map(([cat, amt]) => `${cat} (${formatGBP(amt)})`)
                .join(", ");
              statsResponse += ` Your biggest spending areas are ${categoryList}.`;
            }
          }
        }

        return respond(statsResponse);
      }
    }

    // =========================================================================
    // PROFILE INFO
    // =========================================================================
    const isProfileQuery =
      lowerPrompt.includes("profile") ||
      lowerPrompt.includes("my details") ||
      lowerPrompt.includes("my info") ||
      lowerPrompt.includes("account") ||
      lowerPrompt.includes("business") ||
      lowerPrompt.includes("contact");

    const isAskingAboutProfile =
      lowerPrompt.includes("what") ||
      lowerPrompt.includes("show") ||
      lowerPrompt.includes("tell me") ||
      lowerPrompt.includes("display") ||
      lowerPrompt.includes("view");

    if (isProfileQuery && isAskingAboutProfile && !isWritingRequest && user) {
      const profileResponse = `Here's what I have on file for you:\n\n**${user.fullname}**\n${user.business}\n\n📧 ${user.email}\n📞 ${user.contactPhone}\n📍 ${user.contactAddress}\n\nNeed to update anything?`;
      return respond(profileResponse);
    }

    // =========================================================================
    // SALES / REVENUE STATS
    // =========================================================================
    const isSalesQuery =
      lowerPrompt.includes("sale") ||
      lowerPrompt.includes("sales") ||
      lowerPrompt.includes("revenue");

    const isAskingAboutSales =
      lowerPrompt.includes("biggest") ||
      lowerPrompt.includes("highest") ||
      lowerPrompt.includes("largest") ||
      lowerPrompt.includes("how much") ||
      lowerPrompt.includes("how many") ||
      lowerPrompt.includes("total") ||
      lowerPrompt.includes("this month") ||
      lowerPrompt.includes("last month");

    if (isSalesQuery && isAskingAboutSales && !isWritingRequest) {
      const isAskingBiggest =
        lowerPrompt.includes("biggest") ||
        lowerPrompt.includes("highest") ||
        lowerPrompt.includes("largest");
      const mentionsThisMonth =
        lowerPrompt.includes("this month") ||
        lowerPrompt.includes("current month");
      const mentionsLastMonth = lowerPrompt.includes("last month");

      let statsRes: any;
      let monthName = "";
      const now = new Date();

      if (mentionsLastMonth) {
        statsRes = await getSalesStatsLastMonth(userId);
        if (statsRes.success && statsRes.data.month !== undefined) {
          monthName = getMonthName(statsRes.data.month);
        }
      } else {
        statsRes = await getSalesStatsThisMonth(userId);
        monthName = getMonthName(now.getMonth());
      }

      if (statsRes.success) {
        const { highestSale, totalSales, count } = statsRes.data;
        let statsResponse = "";

        if (count === 0) {
          statsResponse = `You haven't recorded any sales${mentionsLastMonth || mentionsThisMonth ? ` in ${monthName}` : " this month"} yet. ${!mentionsLastMonth ? "It's still early - let's make it a great month!" : ""}`;
        } else if (isAskingBiggest) {
          statsResponse = `Your biggest sale${mentionsLastMonth || mentionsThisMonth ? ` in ${monthName}` : " this month"} is ${formatGBP(highestSale)}. Nice work!`;
        } else {
          const saleWord = count === 1 ? "sale" : "sales";
          statsResponse = `${mentionsLastMonth || mentionsThisMonth ? `In ${monthName}` : "This month"} you${mentionsLastMonth ? "" : "'ve"} made ${count} ${saleWord} totaling ${formatGBP(totalSales)}.`;
          if (count > 5 && !mentionsLastMonth) statsResponse += " You're on a roll!";
          else if (count === 1 && !mentionsLastMonth) statsResponse += " First one down - keep going!";
        }

        return respond(statsResponse);
      }
    }

    // =========================================================================
    // FALLBACK: GEMINI AI
    // =========================================================================
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    const enhancedPrompt = `You are a helpful business assistant for ${user?.fullname || "the user"} who runs ${user?.business || "a business"}. Answer their question in a friendly, conversational way. Keep responses concise and helpful.
User's question: ${prompt}`;

    const aiResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: enhancedPrompt,
      config: {
        systemInstruction: `
          You are a helpful AI assistant for FreelanceMate, an AI-powered mobile app designed for UK freelancers.
          Your role is to help users with:
          - Creating and managing invoices
          - Tracking expenses and financial records
          - Managing clients and client information
          - Generating professional messages (emails, reminders, proposals, follow-ups)
          - Understanding app features, pricing, subscriptions, and in-app tools
          - Answering finance, business, and freelancing questions
          - Explaining business concepts
          - Providing guidance on freelance best practices
          
          IMPORTANT GUIDELINES:
          1. BE CONVERSATIONAL: Answer questions naturally like a knowledgeable business advisor would.
          2. Finance & Business Questions: ALWAYS answer questions about invoices, expenses, payments, business concepts.
          3. DECLINE ONLY: Completely unrelated topics (sports, entertainment, general trivia).
             When declining, say: "I'm here to help with your freelance business and FreelanceMate. Is there anything about invoicing, expenses, or managing your freelance work I can help with?"
          4. Legal/Tax Advice: You CAN explain general concepts. For specific advice, suggest consulting an accountant.
          5. Tone: Friendly, professional, concise, and genuinely helpful.
        `,
      },
    });

    return respond(aiResponse.text as string);
  } catch (error) {
    console.error("[/api/chat] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}