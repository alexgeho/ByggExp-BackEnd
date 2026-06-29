import { Logger } from '@nestjs/common';
import * as mongoose from 'mongoose';
import { generateOCR } from '../src/invoices/generate-ocr';
import { MONGODB_URI } from './load-env';

const DEMO_TAG = 'invoicing-demo-seed';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function calculateTotals(items: Array<{
  quantity?: number;
  price?: number;
  discount?: number;
  vatRate?: number;
}>, reverseVAT = false) {
  const subtotal = items.reduce((sum, item) => {
    const quantity = Number(item.quantity ?? 0);
    const price = Number(item.price ?? 0);
    const discount = Number(item.discount ?? 0);
    return sum + quantity * price * (1 - discount / 100);
  }, 0);
  const vat = reverseVAT
    ? 0
    : items.reduce((sum, item) => {
      const quantity = Number(item.quantity ?? 0);
      const price = Number(item.price ?? 0);
      const discount = Number(item.discount ?? 0);
      const vatRate = Number(item.vatRate ?? 25);
      return sum + quantity * price * (1 - discount / 100) * (vatRate / 100);
    }, 0);

  return { subtotal, vat, total: subtotal + vat };
}

function buildLargeInvoiceItems() {
  const vatRates = [25, 25, 12, 6];
  const units = ['st', 'tim', 'kg', 'm'];

  return Array.from({ length: 42 }, (_, index) => {
    const lineNo = index + 1;
    const vatRate = vatRates[index % vatRates.length];
    const quantity = (index % 5) + 1;
    const price = 450 + (index * 175);
    const discount = index % 7 === 0 ? 5 : 0;

    return {
      articleNumber: String((index % 2) + 1),
      description: `Demo line ${lineNo}\nExtended work/material item for pagination test`,
      quantity,
      unit: units[index % units.length],
      price,
      discount,
      vatRate,
    };
  });
}

async function bootstrap() {
  const logger = new Logger('SeedInvoicingDemo');

  try {
    await mongoose.connect(MONGODB_URI);
    logger.log('Connected to MongoDB');

    const companySchema = new mongoose.Schema({
      name: String,
      address: String,
      email: String,
    }, { timestamps: true });

    const userSchema = new mongoose.Schema({
      email: String,
      name: String,
      role: String,
      companyId: { type: String, ref: 'Company', default: null },
    }, { timestamps: true });

    const clientSchema = new mongoose.Schema({
      companyId: { type: String, ref: 'Company', required: true },
      createdByUserId: { type: String, ref: 'User', required: true },
      clientType: { type: String, enum: ['company', 'private'], default: 'company' },
      companyName: String,
      customerNumber: String,
      address: String,
      postalCode: String,
      city: String,
      country: String,
      contactPerson: String,
      email: String,
      phone: String,
      mobile: String,
      orgNumber: String,
      vatNumber: String,
      firstName: String,
      lastName: String,
      personalNumber: String,
      website: String,
      notes: String,
      currency: String,
      paymentTerms: String,
      reverseVAT: { type: Boolean, default: false },
      seedTag: String,
    }, { timestamps: true });

    const articleSchema = new mongoose.Schema({
      companyId: { type: String, ref: 'Company', required: true },
      createdByUserId: { type: String, ref: 'User', required: true },
      articleNumber: String,
      name: String,
      kontering: String,
      momsPercent: Number,
      priceExclMoms: Number,
      seedTag: String,
    }, { timestamps: true });

    const invoiceSchema = new mongoose.Schema({
      companyId: { type: String, ref: 'Company', required: true },
      createdByUserId: { type: String, ref: 'User', required: true },
      invoiceNumber: Number,
      ocr: String,
      orderReference: String,
      companyName: String,
      customerNumber: String,
      vatNumber: String,
      address: String,
      postalCode: String,
      representative: String,
      email: String,
      phone: String,
      date: String,
      dueDate: String,
      deliveryDate: String,
      paymentTerms: String,
      lateInterest: String,
      ourReference: String,
      yourReference: String,
      reverseVAT: String,
      logoUrl: { type: String, default: null },
      items: { type: Array, default: [] },
      subtotal: Number,
      vat: Number,
      total: Number,
      status: String,
      companyFooter: { type: Object, default: {} },
      seedTag: String,
    }, { timestamps: true, strict: false });

    const offerSchema = new mongoose.Schema({
      companyId: { type: String, ref: 'Company', required: true },
      createdByUserId: { type: String, ref: 'User', required: true },
      offerNumber: Number,
      companyName: String,
      email: String,
      date: String,
      validUntil: String,
      subtitle: String,
      priceText: String,
      description: String,
      clarifications: String,
      contactPersons: { type: Array, default: [] },
      logoUrl: { type: String, default: null },
      items: { type: Array, default: [] },
      subtotal: Number,
      vat: Number,
      total: Number,
      status: String,
      seedTag: String,
    }, { timestamps: true, strict: false });

    const Company = mongoose.models.Company || mongoose.model('Company', companySchema);
    const User = mongoose.models.User || mongoose.model('User', userSchema);
    const Client = mongoose.models.Client || mongoose.model('Client', clientSchema);
    const Article = mongoose.models.Article || mongoose.model('Article', articleSchema);
    const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
    const Offer = mongoose.models.Offer || mongoose.model('Offer', offerSchema);

    const creator =
      (await User.findOne({ role: 'companyAdmin', companyId: { $nin: [null, ''] } }).exec())
      || (await User.findOne({ companyId: { $nin: [null, ''] } }).exec());

    if (!creator?.companyId) {
      throw new Error('No user with companyId found. Create a company admin first.');
    }

    const company = await Company.findById(creator.companyId).exec();
    if (!company) {
      throw new Error(`Company ${creator.companyId} not found for user ${creator.email}.`);
    }

    const companyId = String(company._id);
    const createdByUserId = String(creator._id);

    await Promise.all([
      Client.deleteMany({ companyId, seedTag: DEMO_TAG }),
      Article.deleteMany({ companyId, seedTag: DEMO_TAG }),
      Invoice.deleteMany({ companyId, seedTag: DEMO_TAG }),
      Offer.deleteMany({ companyId, seedTag: DEMO_TAG }),
    ]);

    const clients = await Client.insertMany([
      {
        companyId,
        createdByUserId,
        seedTag: DEMO_TAG,
        clientType: 'company',
        companyName: 'Demo Kund AB',
        customerNumber: '100',
        address: 'Storgatan 1',
        postalCode: '111 22',
        city: 'Stockholm',
        country: 'Sverige',
        contactPerson: 'Anna Andersson',
        email: 'anna@demokund.se',
        phone: '08-123 45 67',
        orgNumber: '556000-0001',
        vatNumber: 'SE556000000101',
        paymentTerms: '20',
        currency: 'SEK',
        reverseVAT: false,
        notes: 'Minimal demo client',
      },
      {
        companyId,
        createdByUserId,
        seedTag: DEMO_TAG,
        clientType: 'company',
        companyName: 'Storbygg Entreprenad AB',
        customerNumber: '101',
        address: 'Industrivägen 18',
        postalCode: '412 58',
        city: 'Göteborg',
        country: 'Sverige',
        contactPerson: 'Erik Eriksson',
        email: 'ekonomi@storbygg.se',
        phone: '031-555 12 12',
        mobile: '070-123 45 67',
        website: 'https://storbygg.se',
        orgNumber: '556123-4567',
        vatNumber: 'SE556123456701',
        paymentTerms: '30',
        currency: 'SEK',
        reverseVAT: false,
        notes: 'Full demo client for large invoice',
      },
    ]);

    const articles = await Article.insertMany([
      {
        companyId,
        createdByUserId,
        seedTag: DEMO_TAG,
        articleNumber: '1',
        name: 'Grundarbete',
        kontering: 'Tjänster 25%',
        momsPercent: 25,
        priceExclMoms: 850,
      },
      {
        companyId,
        createdByUserId,
        seedTag: DEMO_TAG,
        articleNumber: '2',
        name: 'Material och logistik',
        kontering: 'Varor 25%',
        momsPercent: 25,
        priceExclMoms: 1250,
      },
    ]);

    const minimalItems = [{
      articleNumber: articles[0].articleNumber,
      description: articles[0].name,
      quantity: 1,
      unit: 'st',
      price: articles[0].priceExclMoms,
      discount: 0,
      vatRate: articles[0].momsPercent,
    }];
    const minimalTotals = calculateTotals(minimalItems);

    const largeItems = buildLargeInvoiceItems();
    const largeTotals = calculateTotals(largeItems);

    const companyFooter = {
      name: company.name,
      address: company.address,
      city: 'Stockholm',
      phone: '08-700 00 00',
      email: company.email,
      website: 'https://byggexp.se',
      orgNumber: '556999-0001',
      vatNumber: 'SE556999000101',
      vatStatus: 'Godkänd för F-skatt',
    };

    const invoices = [
      {
        companyId,
        createdByUserId,
        seedTag: DEMO_TAG,
        invoiceNumber: 1,
        ocr: generateOCR(1),
        companyName: clients[0].companyName,
        customerNumber: clients[0].customerNumber,
        address: clients[0].address,
        postalCode: `${clients[0].postalCode} ${clients[0].city}`,
        email: clients[0].email,
        phone: clients[0].phone,
        date: today(),
        dueDate: addDays(20),
        deliveryDate: today(),
        status: 'draft',
        reverseVAT: 'false',
        items: minimalItems,
        subtotal: minimalTotals.subtotal,
        vat: minimalTotals.vat,
        total: minimalTotals.total,
        companyFooter,
      },
      {
        companyId,
        createdByUserId,
        seedTag: DEMO_TAG,
        invoiceNumber: 2,
        ocr: generateOCR(2),
        companyName: clients[1].companyName,
        customerNumber: clients[1].customerNumber,
        vatNumber: clients[1].vatNumber,
        address: clients[1].address,
        postalCode: `${clients[1].postalCode} ${clients[1].city}`,
        representative: clients[1].contactPerson,
        email: clients[1].email,
        phone: clients[1].phone,
        date: today(),
        dueDate: addDays(30),
        deliveryDate: today(),
        ourReference: creator.name || 'Demo Admin',
        yourReference: clients[1].contactPerson,
        orderReference: 'PO-2026-042',
        paymentTerms: '30 dagar netto',
        lateInterest: 'Vid betalning efter förfallodagen debiteras ränta enligt räntelagen.',
        status: 'sent',
        reverseVAT: 'false',
        items: largeItems,
        subtotal: largeTotals.subtotal,
        vat: largeTotals.vat,
        total: largeTotals.total,
        companyFooter,
      },
    ];

    const offers = [
      {
        companyId,
        createdByUserId,
        seedTag: DEMO_TAG,
        offerNumber: 1,
        companyName: clients[0].companyName,
        email: clients[0].email,
        date: today(),
        validUntil: addDays(20),
        subtitle: 'Grundarbete för mindre projekt',
        priceText: `${minimalTotals.total.toLocaleString('sv-SE')} kr inkl. moms`,
        description: [
          'Vi erbjuder utförande av grundarbete enligt genomgång på plats.',
          'Arbetet inkluderar planering, etablering och utförande med en demo-rad som motsvarar den minimala fakturan.',
        ].join('\n\n'),
        clarifications: [
          'Priset baseras på tillgänglighet enligt överenskommen tidsplan.',
          'Eventuella tillkommande arbeten hanteras efter skriftligt godkännande.',
        ].join('\n'),
        contactPersons: [
          { role: 'Projektledare', name: creator.name || 'Demo Admin' },
          { role: 'Kundkontakt', name: clients[0].contactPerson },
        ],
        items: minimalItems,
        subtotal: minimalTotals.subtotal,
        vat: minimalTotals.vat,
        total: minimalTotals.total,
        status: 'draft',
      },
      {
        companyId,
        createdByUserId,
        seedTag: DEMO_TAG,
        offerNumber: 2,
        companyName: clients[1].companyName,
        email: clients[1].email,
        date: today(),
        validUntil: addDays(30),
        subtitle: 'Entreprenadoffert med material och logistik',
        priceText: `${largeTotals.total.toLocaleString('sv-SE')} kr inkl. moms`,
        description: [
          'Offerten omfattar ett större entreprenadupplägg med arbete, material och logistik.',
          'Innehållet speglar den stora demo-fakturan och är avsett för att testa längre offerttexter i adminflödet.',
        ].join('\n\n'),
        clarifications: [
          'Leverans sker enligt överenskommen projektplan.',
          'Offerten gäller för angiven omfattning och förutsätter fri åtkomst till arbetsområdet.',
          'Ändringar i mängder, material eller tidsplan kan påverka priset.',
        ].join('\n'),
        contactPersons: [
          { role: 'Projektledare', name: creator.name || 'Demo Admin' },
          { role: 'Beställare', name: clients[1].contactPerson },
        ],
        items: largeItems,
        subtotal: largeTotals.subtotal,
        vat: largeTotals.vat,
        total: largeTotals.total,
        status: 'sent',
      },
    ];

    await Promise.all([
      Invoice.insertMany(invoices),
      Offer.insertMany(offers),
    ]);

    logger.log(`Company: ${company.name} (${companyId})`);
    logger.log(`Created by user: ${creator.email}`);
    logger.log(`Clients: ${clients.length}`);
    logger.log(`Articles: ${articles.length}`);
    logger.log(`Invoices: ${invoices.length} (minimal #1, multi-page #2 with ${largeItems.length} rows)`);
    logger.log(`Offers: ${offers.length} (matching invoice demo clients #1 and #2)`);
    logger.log('Done. Re-run safely: existing demo seed data is replaced.');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('Failed to seed invoicing demo data', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

bootstrap();
