const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    const users = await prisma.user.findMany({
        include: {
            expenses: {
                take: 5
            },
            incomes: {
                take: 5
            }
        }
    })

    users.forEach(u => {
        console.log(`User: ${u.name} (${u.email})`)
        console.log(`  Expenses: ${u.expenses.length} last 5`)
        u.expenses.forEach(e => console.log(`    - ${e.title}: R$${e.amount / 100}`))
        console.log(`  Incomes: ${u.incomes.length} last 5`)
        u.incomes.forEach(i => console.log(`    - ${i.title}: R$${i.expectedAmount / 100}`))
    })
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
