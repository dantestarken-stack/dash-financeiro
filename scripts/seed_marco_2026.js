/**
 * seed_marco_2026.js
 * Limpa todos os registros do usuário principal e re-popula com dados limpos de Março/2026.
 *
 * Layout financeiro:
 *  RECEITAS
 *    - Salário Fixo: R$ 3.500,00 (recebido)
 *    - Comissão Oklahoma: R$ 450,00 (pendente) — adiantamento parcial de R$ 330
 *    - Comissão Senhor Salsicha: R$ 270,00 (pendente)
 *    - Comissão New Service: R$ 540,00 (pendente)
 *    - Comissão Don Ferreira: R$ 450,00 (pendente)
 *    - Recebimento de Dívida (amigo): R$ 650,00 (pendente — futuro)
 *
 *  DESPESAS
 *    - Aluguel: R$ 2.000,00 (pendente)
 *    - Condomínio: R$ 600,00 (pendente)
 *    - Energia Elétrica: R$ 400,00 (pendente)
 *    - Internet: R$ 150,00 (pendente)
 *    - Supermercado: R$ 800,00 (pendente)
 *    - Combustível: R$ 300,00 (pendente)
 *    - Academia: R$ 120,00 (pendente)
 *
 *  Saldo da conta = Salário recebido + Adiantamento comissão = R$ 3.830,00
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const USER_EMAIL = 'dante.starken@gmail.com';

// Datas de Março 2026 (UTC puro para evitar deslocamento de fuso)
function d(day) {
  return new Date(Date.UTC(2026, 2, day)); // mês 2 = março
}
function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
const competencyMar = new Date(Date.UTC(2026, 2, 1)); // 2026-03-01


async function main() {
  // ─── 1. Busca o usuário ────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) throw new Error('Usuário não encontrado: ' + USER_EMAIL);
  const userId = user.id;
  console.log('👤 Usuário:', user.name, '|', userId);

  // ─── 2. Limpa todos os registros do usuário ────────────────────────────────
  console.log('\n🗑️  Limpando registros antigos...');
  await prisma.attachment.deleteMany({ where: { userId } });
  await prisma.recurringRule.deleteMany({ where: { userId } });
  await prisma.installmentGroup.deleteMany({ where: { userId } });
  await prisma.expense.deleteMany({ where: { userId } });
  await prisma.income.deleteMany({ where: { userId } });
  await prisma.goal.deleteMany({ where: { userId } });
  await prisma.asset.deleteMany({ where: { userId } });
  await prisma.liability.deleteMany({ where: { userId } });
  await prisma.alert.deleteMany({ where: { userId } });
  await prisma.transactionTag.deleteMany({ where: { tag: { userId } } });
  await prisma.tag.deleteMany({ where: { userId } });
  await prisma.expenseSubcategory.deleteMany({ where: { userId } });
  await prisma.expenseCategory.deleteMany({ where: { userId } });
  await prisma.incomeSource.deleteMany({ where: { userId } });
  await prisma.card.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.userProfile.deleteMany({ where: { userId } });
  console.log('✅ Limpo.');

  // ─── 3. Recria a conta principal ───────────────────────────────────────────
  // Saldo = Salário recebido (3500) + Adiantamento comissão (330)
  const account = await prisma.account.create({
    data: {
      userId,
      name: 'Conta Principal',
      type: 'checking',
      currentBalance: 383000, // R$ 3.830,00 em centavos
      initialBalance: 0,
      color: '#135bec',
    }
  });
  console.log('\n🏦 Conta criada:', account.name, '| Saldo: R$ 3.830,00');

  // ─── 4. Fontes de Receita ──────────────────────────────────────────────────
  const srcSalario = await prisma.incomeSource.create({
    data: { userId, name: 'Salário', type: 'salary' }
  });
  const srcComissao = await prisma.incomeSource.create({
    data: { userId, name: 'Comissão / Extras', type: 'commission' }
  });
  const srcDivida = await prisma.incomeSource.create({
    data: { userId, name: 'Recebimento de Dívida', type: 'debt_recovery' }
  });
  console.log('\n💼 Fontes de receita criadas.');

  // ─── 5. Categorias de Despesa ──────────────────────────────────────────────
  const catMoradia = await prisma.expenseCategory.create({
    data: { userId, name: 'Moradia', icon: 'home', color: '#6366f1', budgetLimit: 320000 }
  });
  await prisma.expenseSubcategory.createMany({
    data: [
      { userId, categoryId: catMoradia.id, name: 'aluguel' },
      { userId, categoryId: catMoradia.id, name: 'condomínio' },
      { userId, categoryId: catMoradia.id, name: 'energia elétrica' },
      { userId, categoryId: catMoradia.id, name: 'internet residencial' },
    ]
  });

  const catAlimentacao = await prisma.expenseCategory.create({
    data: { userId, name: 'Alimentação', icon: 'restaurant', color: '#f59e0b', budgetLimit: 120000 }
  });
  await prisma.expenseSubcategory.createMany({
    data: [
      { userId, categoryId: catAlimentacao.id, name: 'supermercado' },
      { userId, categoryId: catAlimentacao.id, name: 'delivery' },
    ]
  });

  const catTransporte = await prisma.expenseCategory.create({
    data: { userId, name: 'Transporte', icon: 'directions_car', color: '#10b981', budgetLimit: 50000 }
  });
  await prisma.expenseSubcategory.createMany({
    data: [
      { userId, categoryId: catTransporte.id, name: 'combustível' },
    ]
  });

  const catSaude = await prisma.expenseCategory.create({
    data: { userId, name: 'Saúde & Bem-estar', icon: 'fitness_center', color: '#f43f5e', budgetLimit: 30000 }
  });
  await prisma.expenseSubcategory.createMany({
    data: [
      { userId, categoryId: catSaude.id, name: 'academia' },
    ]
  });

  console.log('🗂️  Categorias criadas.');

  // ─── 6. RECEITAS ───────────────────────────────────────────────────────────
  console.log('\n💰 Criando receitas...');

  // 6a. Salário fixo — RECEBIDO (creditado na conta)
  const salario = await prisma.income.create({
    data: {
      userId,
      accountId: account.id,
      incomeSourceId: srcSalario.id,
      title: 'Salário Fixo',
      expectedAmount: 350000,  // R$ 3.500,00
      receivedAmount: 350000,
      type: 'salary',
      status: 'received',
      dueDate: d(5),
      receivedDate: d(5),
      competencyDate: competencyMar,
      notes: 'Salário base mensal',
      isRecurring: false,
    }
  });
  console.log('  ✅ Salário Fixo: R$ 3.500,00 — RECEBIDO');

  // 6b. Comissão Oklahoma — PARCIALMENTE recebida (R$ 330 adiantado de R$ 450)
  // O adiantamento de R$ 330 é tratado como pagamento parcial desta comissão
  const comOklahoma = await prisma.income.create({
    data: {
      userId,
      accountId: account.id,
      incomeSourceId: srcComissao.id,
      title: 'Comissão - Oklahoma',
      expectedAmount: 45000,   // R$ 450,00
      receivedAmount: 33000,   // R$ 330,00 (adiantamento já recebido)
      type: 'commission',
      status: 'partial',       // partial = adiantamento parcial recebido
      dueDate: d(31),
      receivedDate: d(24),     // data do adiantamento
      competencyDate: competencyMar,
      notes: 'Adiantamento de R$ 330 recebido. Saldo: R$ 120',
    }
  });
  console.log('  ✅ Comissão Oklahoma: R$ 450,00 — PARTIAL (R$ 330 adiantado, falta R$ 120)');

  // 6c. Comissão Senhor Salsicha — PENDENTE
  await prisma.income.create({
    data: {
      userId,
      accountId: account.id,
      incomeSourceId: srcComissao.id,
      title: 'Comissão - Senhor Salsicha',
      expectedAmount: 27000,   // R$ 270,00
      receivedAmount: 0,
      type: 'commission',
      status: 'expected',
      dueDate: d(31),
      competencyDate: competencyMar,
    }
  });
  console.log('  ⏳ Comissão Senhor Salsicha: R$ 270,00 — PENDENTE');

  // 6d. Comissão New Service — PENDENTE
  await prisma.income.create({
    data: {
      userId,
      accountId: account.id,
      incomeSourceId: srcComissao.id,
      title: 'Comissão - New Service',
      expectedAmount: 54000,   // R$ 540,00
      receivedAmount: 0,
      type: 'commission',
      status: 'expected',
      dueDate: d(31),
      competencyDate: competencyMar,
    }
  });
  console.log('  ⏳ Comissão New Service: R$ 540,00 — PENDENTE');

  // 6e. Comissão Don Ferreira — PENDENTE
  await prisma.income.create({
    data: {
      userId,
      accountId: account.id,
      incomeSourceId: srcComissao.id,
      title: 'Comissão - Don Ferreira',
      expectedAmount: 45000,   // R$ 450,00
      receivedAmount: 0,
      type: 'commission',
      status: 'expected',
      dueDate: d(31),
      competencyDate: competencyMar,
    }
  });
  console.log('  ⏳ Comissão Don Ferreira: R$ 450,00 — PENDENTE');

  // 6f. Dívida de amigo — PENDENTE (a receber futuramente)
  await prisma.income.create({
    data: {
      userId,
      accountId: account.id,
      incomeSourceId: srcDivida.id,
      title: 'Dívida a receber — Amigo',
      expectedAmount: 65000,   // R$ 650,00
      receivedAmount: 0,
      type: 'other',
      status: 'expected',
      dueDate: d(31),
      competencyDate: competencyMar,
      notes: 'Dívida de amigo a receber',
    }
  });
  console.log('  ⏳ Dívida Amigo: R$ 650,00 — PENDENTE');

  // ─── 7. DESPESAS ───────────────────────────────────────────────────────────
  console.log('\n💸 Criando despesas...');

  const despesas = [
    { title: 'Aluguel', amount: 200000, dueDay: 10, cat: catMoradia.id, nature: 'essential' },
    { title: 'Condomínio', amount: 60000, dueDay: 10, cat: catMoradia.id, nature: 'essential' },
    { title: 'Energia Elétrica', amount: 40000, dueDay: 15, cat: catMoradia.id, nature: 'essential' },
    { title: 'Internet', amount: 15000, dueDay: 15, cat: catMoradia.id, nature: 'essential' },
    { title: 'Supermercado', amount: 80000, dueDay: 20, cat: catAlimentacao.id, nature: 'essential' },
    { title: 'Combustível', amount: 30000, dueDay: 20, cat: catTransporte.id, nature: 'important' },
    { title: 'Academia', amount: 12000, dueDay: 5, cat: catSaude.id, nature: 'important' },
  ];

  for (const dep of despesas) {
    const isFixed = ['Aluguel', 'Condomínio', 'Energia Elétrica', 'Internet'].includes(dep.title);
    const expense = await prisma.expense.create({
      data: {
        userId,
        accountId: account.id,
        categoryId: dep.cat,
        title: dep.title,
        amount: dep.amount,
        paidAmount: 0,
        paymentMethod: 'other',
        nature: dep.nature,
        status: 'pending',
        purchaseDate: d(1),
        dueDate: d(dep.dueDay),
        competencyDate: competencyMar,
        isRecurring: isFixed,
      }
    });

    if (isFixed) {
      await prisma.recurringRule.create({
        data: {
          userId,
          entityType: 'expense',
          frequency: 'monthly',
          startDate: d(dep.dueDay),
          nextRunDate: addMonths(d(dep.dueDay), 1),
          expenses: { connect: { id: expense.id } }
        }
      });
    }
    console.log(`  ⏳ ${dep.title}: R$ ${(dep.amount / 100).toFixed(2).replace('.', ',')} — PENDENTE ${isFixed ? '(FIXA)' : ''}`);
  }


  // ─── 8. Resumo final ───────────────────────────────────────────────────────
  const comissoesPendentes = (45000 - 33000) + 27000 + 54000 + 45000; // R$ 1.380,00
  const totalDespesas = despesas.reduce((a, d) => a + d.amount, 0);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 RESUMO DE MARÇO 2026');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`💰 Saldo atual em conta:          R$ 3.830,00`);
  console.log(`✅ Salário recebido:               R$ 3.500,00`);
  console.log(`⏳ Comissões a receber (radar):    R$ ${(comissoesPendentes / 100).toFixed(2).replace('.', ',')} (inclui R$ 330 parcial de Oklahoma)`);
  console.log(`⏳ Dívida a receber:               R$   650,00`);
  console.log(`⏳ Total despesas pendentes:       R$ ${(totalDespesas / 100).toFixed(2).replace('.', ',')}`);
  console.log(`📈 Saldo projetado:                R$ ${((383000 + comissoesPendentes + 65000 - totalDespesas) / 100).toFixed(2).replace('.', ',')}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Erro:', e.message);
  process.exit(1);
});
