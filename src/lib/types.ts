/**
 * Interfaces TypeScript para os dados do Dashboard.
 * Elimina o uso de `any` no DashboardClient e garante type safety em toda a UI.
 */

export interface KPIs {
  accountBalance: number;
  actualIncome: number;
  remainingIncome: number;
  paidExpense: number;
  pendingExpense: number;
  projectedBalance: number;
  pendingCommissions: number;
  receivedCommissionsThisMonth: number;
  estimatedFreeBalance: number;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  pendingSalaryBalance: number;
}

export interface SpentByNature {
  essential: number;
  important: number;
  superfluous: number;
}

export type TransactionStatus =
  | "paid"
  | "received"
  | "pending"
  | "expected"
  | "partial"
  | "overdue";

export interface Transaction {
  id: string;
  name: string;
  amount: number;
  type: "income" | "expense";
  date: string;
  displayDate: string;
  status: TransactionStatus;
  nature?: string;
  categoryId?: string;
  incomeSourceId?: string;
  isDebtRecovery?: boolean;
  isRecurring?: boolean;
  notes?: string | null;
  attachmentUrl?: string;
  createdAt?: Date;
}

export interface IncomeSource {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpenseSubcategory {
  id: string;
  categoryId: string;
  userId: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpenseCategory {
  id: string;
  userId: string;
  name: string;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  isActive: boolean;
  budgetLimit: number;
  createdAt: Date;
  updatedAt: Date;
  subcategories: ExpenseSubcategory[];
}

export interface Asset {
  id: string;
  userId: string;
  name: string;
  type: string;
  amount: number;
  valuationDate: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Liability {
  id: string;
  userId: string;
  name: string;
  type: string;
  totalAmount: number;
  outstandingAmount: number;
  monthlyPayment: number;
  interestRate: number | null;
  dueDate: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  type: string;
  targetAmount: number;
  currentAmount: number;
  monthlyTargetAmount: number | null;
  startDate: Date;
  targetDate: Date;
  status: string;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountSummary {
  id: string;
  name: string;
  balance: number;
}

export interface CardSummary {
  id: string;
  name: string;
  brand: string | null;
  limitAmount: number;
  closingDay: number;
  dueDay: number;
  accountName?: string | null;
}

export interface BudgetStatus {
  id: string;
  name: string;
  limit: number;
  spent: number;
  percent: number;
}

export interface FutureCommission {
  label: string;
  amount: number;
}

export interface UserInfo {
  id: string;
  name: string;
  email: string;
}

export interface DashboardData {
  kpis: KPIs;
  spentByNature: SpentByNature;
  user: UserInfo;
  defaultAccountId: string | undefined;
  recentTransactions: Transaction[];
  allTransactions: Transaction[];
  futureCommissions: FutureCommission[];
  incomeSources: IncomeSource[];
  debtRecoverySourceId: string;
  expenseCategories: ExpenseCategory[];
  assets: Asset[];
  liabilities: Liability[];
  goals: Goal[];
  accounts: AccountSummary[];
  budgetStatus: BudgetStatus[];
  cards: CardSummary[];
}
