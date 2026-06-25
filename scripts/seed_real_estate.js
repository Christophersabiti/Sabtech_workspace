const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Custom env parser
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        process.env[key] = value.trim();
      }
    });
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const COMPANY_ID = '89659146-f791-4b33-924e-4822ca2069be'; // SW Real Estate

async function seed() {
  console.log(`Starting real estate seed for company: ${COMPANY_ID}`);

  // 1. Verify company exists
  const { data: company, error: companyErr } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', COMPANY_ID)
    .single();

  if (companyErr || !company) {
    console.error('Target company not found in database:', companyErr);
    process.exit(1);
  }
  console.log(`Verified company: ${company.name} (${company.id})`);

  // 2. Fetch an app_user_id associated with the company to assign as author
  const { data: member, error: memberErr } = await supabase
    .from('company_users')
    .select('app_user_id')
    .eq('company_id', COMPANY_ID)
    .limit(1)
    .single();

  const userId = member ? member.app_user_id : null;
  console.log(`Using app_user_id for seeding: ${userId || 'NULL (No user found)'}`);

  // 3. Clear old data for this company (foreign-key safe ordering)
  console.log('Cleaning up existing company transactions...');
  await supabase.from('expenses').delete().eq('company_id', COMPANY_ID);
  await supabase.from('payments').delete().eq('company_id', COMPANY_ID);
  await supabase.from('invoice_items').delete().eq('company_id', COMPANY_ID);
  await supabase.from('invoices').delete().eq('company_id', COMPANY_ID);
  await supabase.from('invoice_schedules').delete().eq('company_id', COMPANY_ID);
  await supabase.from('project_tasks').delete().eq('company_id', COMPANY_ID);
  await supabase.from('portfolio_projects').delete().eq('company_id', COMPANY_ID);
  await supabase.from('projects').delete().eq('company_id', COMPANY_ID);
  await supabase.from('milestones').delete().eq('company_id', COMPANY_ID);
  await supabase.from('portfolios').delete().eq('company_id', COMPANY_ID);
  await supabase.from('clients').delete().eq('company_id', COMPANY_ID);
  await supabase.from('services').delete().eq('company_id', COMPANY_ID);
  console.log('Cleanup complete.');

  // 4. Seed Services
  console.log('Seeding Services...');
  const { data: services, error: servicesErr } = await supabase
    .from('services')
    .insert([
      { company_id: COMPANY_ID, service_code: 'RENT-RES', service_name: 'Residential Monthly Rent', category: 'Rentals', default_price: 1200000 },
      { company_id: COMPANY_ID, service_code: 'RENT-COM', service_name: 'Commercial Rent (Sq Ft)', category: 'Rentals', default_price: 3500000 },
      { company_id: COMPANY_ID, service_code: 'SERV-CHG', service_name: 'Service Charge (Amenities)', category: 'Utilities', default_price: 150000 },
      { company_id: COMPANY_ID, service_code: 'LAND-PLOT', service_name: 'Subdivided Plot Sale', category: 'Sales', default_price: 25000000 },
      { company_id: COMPANY_ID, service_code: 'MAINT-FEE', service_name: 'Maintenance & Repairs', category: 'Maintenance', default_price: 50000 }
    ])
    .select();

  if (servicesErr) {
    console.error('Error seeding services:', servicesErr);
    process.exit(1);
  }
  console.log(`Seeded ${services.length} services.`);

  const rentResSvc = services.find(s => s.service_code === 'RENT-RES');
  const rentComSvc = services.find(s => s.service_code === 'RENT-COM');
  const servChgSvc = services.find(s => s.service_code === 'SERV-CHG');
  const landPlotSvc = services.find(s => s.service_code === 'LAND-PLOT');

  // 5. Seed Clients (Tenants, Buyers)
  console.log('Seeding Clients...');
  const { data: clients, error: clientsErr } = await supabase
    .from('clients')
    .insert([
      {
        company_id: COMPANY_ID,
        client_code: 'TEN-001',
        name: 'John Doe',
        company_name: 'Doe Residential Rentals',
        email: 'johndoe@example.test',
        phone: '+256 701 123456',
        address: 'Apartment 3B, Sabtech Heights, Kirinya',
        currency: 'UGX'
      },
      {
        company_id: COMPANY_ID,
        client_code: 'TEN-002',
        name: 'Jane Smith',
        company_name: 'Smith Tech Solutions Ltd',
        email: 'jane@smithtech.test',
        phone: '+256 702 654321',
        address: 'Suite 102, Kla Commercial Hub, Kampala',
        currency: 'UGX'
      },
      {
        company_id: COMPANY_ID,
        client_code: 'BUY-001',
        name: 'Acme Corporation',
        company_name: 'Acme Corp East Africa',
        email: 'procurement@acmecorp.test',
        phone: '+256 772 987654',
        address: 'Plot 45, Gombe Phase 1 Estate, Wakiso',
        currency: 'UGX'
      }
    ])
    .select();

  if (clientsErr) {
    console.error('Error seeding clients:', clientsErr);
    process.exit(1);
  }
  console.log(`Seeded ${clients.length} clients.`);

  const clientJohn = clients.find(c => c.client_code === 'TEN-001');
  const clientJane = clients.find(c => c.client_code === 'TEN-002');
  const clientAcme = clients.find(c => c.client_code === 'BUY-001');

  // 6. Seed Portfolios (Properties)
  console.log('Seeding Portfolios (Properties)...');
  const { data: portfolios, error: portfoliosErr } = await supabase
    .from('portfolios')
    .insert([
      {
        company_id: COMPANY_ID,
        name: 'Sabtech Heights Apartments',
        description: '12-unit premium residential apartment block in Bweyogerere.',
        status: 'active',
        health_status: 'on_track',
        budget_total: 500000000,
        owner_id: userId
      },
      {
        company_id: COMPANY_ID,
        name: 'Kla Commercial Hub',
        description: 'Modern office tower complex on Kampala Road.',
        status: 'active',
        health_status: 'on_track',
        budget_total: 1200000000,
        owner_id: userId
      },
      {
        company_id: COMPANY_ID,
        name: 'Gombe Phase 1 Estate',
        description: 'Subdivided estate plots located in Gombe, Wakiso.',
        status: 'active',
        health_status: 'on_track',
        budget_total: 800000000,
        owner_id: userId
      }
    ])
    .select();

  if (portfoliosErr) {
    console.error('Error seeding portfolios:', portfoliosErr);
    process.exit(1);
  }
  console.log(`Seeded ${portfolios.length} portfolios.`);

  const portHeights = portfolios.find(p => p.name === 'Sabtech Heights Apartments');
  const portKlaHub = portfolios.find(p => p.name === 'Kla Commercial Hub');
  const portGombe = portfolios.find(p => p.name === 'Gombe Phase 1 Estate');

  // 7. Seed Projects (Leases and Acquisition phases)
  console.log('Seeding Projects...');
  const { data: projects, error: projectsErr } = await supabase
    .from('projects')
    .insert([
      {
        company_id: COMPANY_ID,
        client_id: clientJohn.id,
        project_code: 'PRJ-3B',
        project_name: 'Apartment 3B Rental Unit',
        description: 'Residential lease agreement tracking for Apartment 3B.',
        billing_type: 'recurring',
        total_contract_amount: 14400000,
        project_manager: 'Sarah Nakalema',
        status: 'active',
        start_date: '2026-01-01',
        end_date: '2026-12-31'
      },
      {
        company_id: COMPANY_ID,
        client_id: clientJane.id,
        project_code: 'PRJ-102',
        project_name: 'Office 102 Rental Unit',
        description: 'Commercial office lease agreement tracking for Suite 102.',
        billing_type: 'recurring',
        total_contract_amount: 42000000,
        project_manager: 'Sarah Nakalema',
        status: 'active',
        start_date: '2026-01-01',
        end_date: '2026-12-31'
      },
      {
        company_id: COMPANY_ID,
        client_id: clientAcme.id,
        project_code: 'PRJ-GOM-45',
        project_name: 'Plot 45 Land Purchase',
        description: 'Acquisition and transfer timeline of Plot 45 in Gombe Estate.',
        billing_type: 'installment',
        total_contract_amount: 25000000,
        project_manager: 'Alex Mukasa',
        status: 'active',
        start_date: '2026-05-15',
        end_date: '2026-10-15'
      }
    ])
    .select();

  if (projectsErr) {
    console.error('Error seeding projects:', projectsErr);
    process.exit(1);
  }
  console.log(`Seeded ${projects.length} projects.`);

  const projHeights = projects.find(p => p.project_code === 'PRJ-3B');
  const projKlaHub = projects.find(p => p.project_code === 'PRJ-102');
  const projGombe = projects.find(p => p.project_code === 'PRJ-GOM-45');

  // Link projects to portfolios
  console.log('Mapping projects to portfolios...');
  const { error: ppErr } = await supabase
    .from('portfolio_projects')
    .insert([
      { company_id: COMPANY_ID, portfolio_id: portHeights.id, project_id: projHeights.id },
      { company_id: COMPANY_ID, portfolio_id: portKlaHub.id, project_id: projKlaHub.id },
      { company_id: COMPANY_ID, portfolio_id: portGombe.id, project_id: projGombe.id }
    ]);

  if (ppErr) {
    console.error('Error linking projects to portfolios:', ppErr);
    process.exit(1);
  }

  // 8. Seed Project Tasks (Maintenance / Construction work)
  console.log('Seeding Tasks...');
  const { data: tasks, error: tasksErr } = await supabase
    .from('project_tasks')
    .insert([
      {
        company_id: COMPANY_ID,
        project_id: projHeights.id,
        client_id: clientJohn.id,
        title: 'Repair Leaking Pluvial Valve',
        description: 'Inspect and fix leaking pluvial valve in the master ensuite shower.',
        status: 'completed',
        priority: 'high',
        progress: 100,
        completed_at: new Date('2026-06-10T14:00:00Z').toISOString(),
        cost_estimate: 50000,
        actual_cost: 40000,
        client_visible: true
      },
      {
        company_id: COMPANY_ID,
        project_id: projHeights.id,
        client_id: clientJohn.id,
        title: 'Annual Pest Control & Spraying',
        description: 'Conduct comprehensive pesticide spraying for insects and rodents.',
        status: 'pending',
        priority: 'medium',
        progress: 0,
        cost_estimate: 150000,
        client_visible: true
      },
      {
        company_id: COMPANY_ID,
        project_id: projGombe.id,
        client_id: clientAcme.id,
        title: 'Topographical Surveying & Pegging',
        description: 'Define physical boundaries, install concrete pegs, and issue boundary report.',
        status: 'completed',
        priority: 'high',
        progress: 100,
        completed_at: new Date('2026-05-25T11:00:00Z').toISOString(),
        cost_estimate: 1500000,
        actual_cost: 1500000,
        client_visible: true
      },
      {
        company_id: COMPANY_ID,
        project_id: projGombe.id,
        client_id: clientAcme.id,
        title: 'Title Deed Transfer Filing',
        description: 'Submit registry forms and land transfer consent files to government registrar.',
        status: 'in_progress',
        priority: 'critical',
        progress: 40,
        cost_estimate: 1000000,
        client_visible: true
      }
    ])
    .select();

  if (tasksErr) {
    console.error('Error seeding tasks:', tasksErr);
    process.exit(1);
  }
  console.log(`Seeded ${tasks.length} tasks.`);

  // 9. Seed Milestones
  console.log('Seeding Milestones...');
  const { data: milestones, error: milestonesErr } = await supabase
    .from('milestones')
    .insert([
      {
        company_id: COMPANY_ID,
        project_id: projGombe.id,
        name: 'Deposit Agreement Settlement',
        description: 'Receive first 20% booking payment and sign initial sale contract.',
        target_date: '2026-05-20',
        actual_date: '2026-05-20',
        status: 'completed',
        progress: 100,
        remarks: 'Contract signed, funds cleared.'
      },
      {
        company_id: COMPANY_ID,
        project_id: projGombe.id,
        name: 'Surveying & Boundary Setup',
        description: 'Complete physical boundary markings and obtain structural survey document.',
        target_date: '2026-05-30',
        actual_date: '2026-05-28',
        status: 'completed',
        progress: 100,
        remarks: 'Boundary reports filed to client.'
      },
      {
        company_id: COMPANY_ID,
        project_id: projGombe.id,
        name: 'Title Deed Issuance',
        description: 'Registration and release of the physical title deed in client name.',
        target_date: '2026-08-30',
        status: 'in_progress',
        progress: 20
      }
    ])
    .select();

  if (milestonesErr) {
    console.error('Error seeding milestones:', milestonesErr);
    process.exit(1);
  }
  console.log(`Seeded ${milestones.length} milestones.`);

  // 10. Seed Invoices
  console.log('Seeding Invoices...');
  const { data: invoices, error: invoicesErr } = await supabase
    .from('invoices')
    .insert([
      {
        company_id: COMPANY_ID,
        client_id: clientJohn.id,
        project_id: projHeights.id,
        invoice_number: 'INV-2026-001',
        issue_date: '2026-06-01',
        due_date: '2026-06-15',
        currency: 'UGX',
        subtotal: 1200000,
        discount_amount: 0,
        tax_amount: 0,
        total_amount: 1200000,
        total_paid: 1200000,
        balance_due: 0,
        status: 'paid',
        net_payable_amount: 1200000,
        notes: 'Monthly rent for Apartment 3B - June 2026.'
      },
      {
        company_id: COMPANY_ID,
        client_id: clientJane.id,
        project_id: projKlaHub.id,
        invoice_number: 'INV-2026-002',
        issue_date: '2026-06-01',
        due_date: '2026-06-15',
        currency: 'UGX',
        subtotal: 150000,
        discount_amount: 0,
        tax_amount: 27000,
        total_amount: 177000,
        total_paid: 0,
        balance_due: 177000,
        status: 'sent',
        net_payable_amount: 177000,
        notes: 'Service Charge for Suite 102 - June 2026. (Includes 18% VAT)'
      },
      {
        company_id: COMPANY_ID,
        client_id: clientAcme.id,
        project_id: projGombe.id,
        invoice_number: 'INV-2026-003',
        issue_date: '2026-05-18',
        due_date: '2026-06-01',
        currency: 'UGX',
        subtotal: 5000000,
        discount_amount: 0,
        tax_amount: 0,
        total_amount: 5000000,
        total_paid: 5000000,
        balance_due: 0,
        status: 'paid',
        net_payable_amount: 5000000,
        notes: '20% Booking Deposit installment for Plot 45.'
      }
    ])
    .select();

  if (invoicesErr) {
    console.error('Error seeding invoices:', invoicesErr);
    process.exit(1);
  }
  console.log(`Seeded ${invoices.length} invoices.`);

  const invJohn = invoices.find(i => i.invoice_number === 'INV-2026-001');
  const invJane = invoices.find(i => i.invoice_number === 'INV-2026-002');
  const invAcme = invoices.find(i => i.invoice_number === 'INV-2026-003');

  // Seed Invoice Items
  console.log('Seeding Invoice Items...');
  const { error: itemsErr } = await supabase
    .from('invoice_items')
    .insert([
      {
        company_id: COMPANY_ID,
        invoice_id: invJohn.id,
        service_id: rentResSvc.id,
        item_name: 'Residential Monthly Rent',
        description: 'Apartment 3B Monthly Rental Rate - June 2026',
        quantity: 1,
        unit_price: 1200000,
        discount_percent: 0,
        tax_percent: 0,
        line_total: 1200000
      },
      {
        company_id: COMPANY_ID,
        invoice_id: invJane.id,
        service_id: servChgSvc.id,
        item_name: 'Amenities Service Charge',
        description: 'Suite 102 monthly security, waste, water allocation - June 2026',
        quantity: 1,
        unit_price: 150000,
        discount_percent: 0,
        tax_percent: 18,
        line_total: 177000
      },
      {
        company_id: COMPANY_ID,
        invoice_id: invAcme.id,
        service_id: landPlotSvc.id,
        item_name: 'Gombe Plot 45 - Booking Installment',
        description: '20% Initial payment of UGX 25,000,000 purchase rate',
        quantity: 1,
        unit_price: 5000000,
        discount_percent: 0,
        tax_percent: 0,
        line_total: 5000000
      }
    ]);

  if (itemsErr) {
    console.error('Error seeding invoice items:', itemsErr);
    process.exit(1);
  }

  // Seed Invoice Schedules (Installment Plans)
  console.log('Seeding Invoice Schedules...');
  const { error: schedulesErr } = await supabase
    .from('invoice_schedules')
    .insert([
      {
        company_id: COMPANY_ID,
        project_id: projGombe.id,
        schedule_name: 'Booking Deposit (20%)',
        description: 'Required booking deposit for plot retention.',
        percentage: 20.00,
        fixed_amount: 5000000,
        due_date: '2026-05-20',
        status: 'paid',
        generated_invoice_id: invAcme.id
      },
      {
        company_id: COMPANY_ID,
        project_id: projGombe.id,
        schedule_name: 'Pegging Signoff (40%)',
        description: 'Triggered when concrete boundary pegging is placed.',
        percentage: 40.00,
        fixed_amount: 10000000,
        due_date: '2026-07-15',
        status: 'pending'
      },
      {
        company_id: COMPANY_ID,
        project_id: projGombe.id,
        schedule_name: 'Title Deed Handover (40%)',
        description: 'Final payment collection upon transfer registry.',
        percentage: 40.00,
        fixed_amount: 10000000,
        due_date: '2026-09-15',
        status: 'pending'
      }
    ]);

  if (schedulesErr) {
    console.error('Error seeding invoice schedules:', schedulesErr);
    process.exit(1);
  }

  // 11. Seed Payments
  console.log('Seeding Payments...');
  const { error: paymentsErr } = await supabase
    .from('payments')
    .insert([
      {
        company_id: COMPANY_ID,
        payment_number: 'PAY-2026-001',
        invoice_id: invJohn.id,
        payment_date: '2026-06-03',
        amount_paid: 1200000,
        payment_method: 'mobile_money',
        reference_number: 'MOP-TX-982181',
        note: 'Rent received via Mobile Money transaction.',
        is_confirmed: true,
        status: 'confirmed',
        actual_received: 1200000
      },
      {
        company_id: COMPANY_ID,
        payment_number: 'PAY-2026-002',
        invoice_id: invAcme.id,
        payment_date: '2026-05-20',
        amount_paid: 5000000,
        payment_method: 'bank_transfer',
        reference_number: 'STANBIC-EFT-7281192',
        note: 'EFT payment confirmed in Stanbic escrow account.',
        is_confirmed: true,
        status: 'confirmed',
        actual_received: 5000000
      }
    ]);

  if (paymentsErr) {
    console.error('Error seeding payments:', paymentsErr);
    process.exit(1);
  }

  // 12. Seed Expenses
  console.log('Fetching expense categories...');
  const { data: expCats, error: expCatErr } = await supabase
    .from('expense_categories')
    .select('id, name')
    .eq('company_id', COMPANY_ID);

  if (expCatErr) {
    console.error('Error fetching categories:', expCatErr);
    process.exit(1);
  }

  const catMaint = expCats.find(c => c.name === 'Maintenance') || expCats[0];
  const catPurchases = expCats.find(c => c.name === 'Purchases') || expCats[0];

  console.log('Seeding Expenses...');
  const { error: expensesErr } = await supabase
    .from('expenses')
    .insert([
      {
        company_id: COMPANY_ID,
        client_id: clientJohn.id,
        project_id: projHeights.id,
        category_id: catMaint.id,
        amount: 40000,
        currency: 'UGX',
        expense_date: '2026-06-10',
        vendor: 'Kasese Plumbing Supplies Ltd',
        description: 'Purchased pluvial brass valve replacement and plumber tools.',
        status: 'paid'
      },
      {
        company_id: COMPANY_ID,
        client_id: clientAcme.id,
        project_id: projGombe.id,
        category_id: catPurchases.id,
        amount: 1500000,
        currency: 'UGX',
        expense_date: '2026-05-25',
        vendor: 'Surveys East Africa',
        description: 'Contracted surveyors for boundary mapping and beacon placing.',
        status: 'paid'
      }
    ]);

  if (expensesErr) {
    console.error('Error seeding expenses:', expensesErr);
    process.exit(1);
  }

  console.log('================================================================');
  console.log('REAL ESTATE SIMULATION DATA SEED COMPLETED SUCCESSFULLY!');
  console.log('================================================================');
  process.exit(0);
}

seed().catch(err => {
  console.error('Fatal seeding error:', err);
  process.exit(1);
});
