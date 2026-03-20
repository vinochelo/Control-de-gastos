import { getMonthlyTransactions, getAllTransactions } from "./firebase_service";

export async function calculateMonthlyReport(userId: string, month: number, year: number) {
  const allTransactions = await getAllTransactions(userId);
  
  let totalIncome = 0;
  let totalExpense = 0;
  const expensesByCategory: Record<string, number> = {};
  const balancesByAccount: Record<string, number> = {};

  // Calculate total balances across all time
  allTransactions.forEach((t: any) => {
    if (t.type === "income") {
      balancesByAccount[t.account] = (balancesByAccount[t.account] || 0) + t.amount;
    } else if (t.type === "expense") {
      balancesByAccount[t.account] = (balancesByAccount[t.account] || 0) - t.amount;
    } else if (t.type === "transfer") {
      balancesByAccount[t.account] = (balancesByAccount[t.account] || 0) - t.amount;
      if (t.toAccount) {
        balancesByAccount[t.toAccount] = (balancesByAccount[t.toAccount] || 0) + t.amount;
      }
    }
  });

  // Filter for the specific month
  const monthlyTransactions = allTransactions.filter((t: any) => {
    const d = new Date(t.date);
    return d.getMonth() + 1 === month && d.getFullYear() === year;
  });

  // Calculate monthly stats
  monthlyTransactions.forEach((t: any) => {
    if (t.type === "income") {
      totalIncome += t.amount;
    } else if (t.type === "expense") {
      totalExpense += t.amount;
      const cat = t.category || "Otros";
      expensesByCategory[cat] = (expensesByCategory[cat] || 0) + t.amount;
    }
  });

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    expensesByCategory,
    balancesByAccount,
    transactions: monthlyTransactions
  };
}
