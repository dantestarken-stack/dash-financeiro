const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    const fromUser = await prisma.user.findUnique({ where: { email: "dante.admin@local.com" } })
    const toUser = await prisma.user.findUnique({ where: { email: "dante.starken@gmail.com" } })

    if (!fromUser || !toUser) {
        console.log("Users not found")
        return
    }

    console.log(`Moving data from ${fromUser.id} to ${toUser.id}`)

    // Move Accounts
    await prisma.account.updateMany({ where: { userId: fromUser.id }, data: { userId: toUser.id } })
    // Move Assets
    await prisma.asset.updateMany({ where: { userId: fromUser.id }, data: { userId: toUser.id } })
    // Move Expense Categories
    await prisma.expenseCategory.updateMany({ where: { userId: fromUser.id }, data: { userId: toUser.id } })
    // Move Income Sources
    await prisma.incomeSource.updateMany({ where: { userId: fromUser.id }, data: { userId: toUser.id } })
    // Move Expenses
    await prisma.expense.updateMany({ where: { userId: fromUser.id }, data: { userId: toUser.id } })
    // Move Incomes
    await prisma.income.updateMany({ where: { userId: fromUser.id }, data: { userId: toUser.id } })
    // Move Goals
    await prisma.goal.updateMany({ where: { userId: fromUser.id }, data: { userId: toUser.id } })
    // Move Recurring Rules
    await prisma.recurringRule.updateMany({ where: { userId: fromUser.id }, data: { userId: toUser.id } })
    // Move Liabilities
    await prisma.liability.updateMany({ where: { userId: fromUser.id }, data: { userId: toUser.id } })

    console.log("Migração concluída.")
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
