import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const expenses = await prisma.expense.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5
    })
    console.log('Last 5 Expenses:', JSON.stringify(expenses, null, 2))
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
