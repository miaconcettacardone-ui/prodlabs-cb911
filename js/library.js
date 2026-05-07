/* ============================================================
 *  library.js — preset options the wizard and views offer
 * ============================================================
 *
 *  WHAT THIS FILE IS:
 *  This is the "catalog" of things teams can choose from when
 *  setting themselves up:
 *    - Departments (Production, Sales, Support, etc.)
 *    - Work units (Chargeback Case, Sales Call, etc.)
 *    - Tracked fields (Amount, Outcome, Notes, etc.)
 *    - Suggested roles per department
 *
 *  WHY HERE INSTEAD OF DATABASE-SEEDED?
 *  These rarely change and they're shared across all teams.
 *  Hardcoding them in this file means:
 *    - Wizard, manager view, and member view all see the same options
 *    - Adding a new work unit is a one-file change
 *    - The rebuild team can drop this into a seed migration
 *
 *  HOW TO EXTEND:
 *  Add new entries to the relevant array — do NOT touch wizard
 *  or view code. The wizard reads from these arrays at render time.
 *
 *  HOW THE LOOKUPS WORK:
 *  - LIBRARY.workUnitLabel(id, overrides) — looks up the human-readable
 *    label for a work-unit id. If the team has a custom label override
 *    (e.g. they call "Chargeback Case" a "Dispute"), that wins.
 *  - LIBRARY.fieldDef(id) — returns the {label, type, options, hint}
 *    metadata for a field id, so the form knows whether to render
 *    a number input or a dropdown.
 * ============================================================ */

const LIBRARY = {

  // Departments — Phase 5 pre-seed (handoff §CB911 vocabulary).
  // Admins can extend this via State.addDepartment() ("Other" path
  // in the Add Manager flow).
  departments: [
    'Alerts',
    'Disputes & Operations',
    'Sales',
    'Reporting & Analytics',
    'Dev & Engineering',
    'Finance',
    'Customer Success',
  ],

  // Work units — CB911-flavored. Teams pick which apply to them
  // and can also add custom ones via the settings panel.
  workUnits: [
    { id: 'alert_handled',     label: 'Alert Handled',       hint: 'Verifi/Ethoca alerts processed' },
    { id: 'dispute_filed',     label: 'Dispute Filed',       hint: 'Chargeback responses submitted' },
    { id: 'case_resolved',     label: 'Case Resolved',       hint: 'Cases closed (won/lost/settled)' },
    { id: 'lead_contacted',    label: 'Lead Contacted',      hint: 'Sales outreach' },
    { id: 'deal_closed',       label: 'Deal Closed',         hint: 'New client signed' },
    { id: 'report_built',      label: 'Report Built',        hint: 'Client report delivered' },
    { id: 'ticket_closed',     label: 'Ticket Closed',       hint: 'Engineering ticket completed' },
    { id: 'invoice_sent',      label: 'Invoice Sent',        hint: 'Billing record created' },
    { id: 'payment_processed', label: 'Payment Processed',   hint: 'Payment recorded/applied' },
    { id: 'check_in',          label: 'Client Check-in',     hint: 'CS touchpoint completed' },
    { id: 'escalation',        label: 'Escalation Resolved', hint: 'Client escalation closed' },
  ],

  // Fields tracked per record. `outcome` enum updated for CB911
  // dispute lifecycle (Won/Lost/Pending/Settled/Refunded/No Action).
  fields: [
    {id:'amount',       label:'Dollar Amount',     hint:'$ value',                 type:'number'},
    {id:'outcome',      label:'Outcome',           hint:'Dispute outcome',         type:'enum',
      options:['Won','Lost','Pending','Settled','Refunded','No Action']},
    {id:'reason_code',  label:'Reason Code',       hint:'e.g. 4855, 10.4',         type:'text'},
    {id:'card_network', label:'Card Network',      hint:'Card brand',              type:'enum',
      options:['Visa','Mastercard','Amex','Discover','Other']},
    {id:'merchant',     label:'Merchant',          hint:'Merchant or client name', type:'text'},
    {id:'case_id',      label:'Case / Record ID',  hint:'Unique identifier',       type:'text'},
    {id:'duration',     label:'Duration (min)',    hint:'Time spent',              type:'number'},
    {id:'priority',     label:'Priority',          hint:'High/Med/Low',            type:'enum',
      options:['High','Medium','Low']},
    {id:'status',       label:'Status',            hint:'Open/InProg/Done',        type:'enum',
      options:['Open','In Progress','Done']},
    {id:'source',       label:'Source',            hint:'Where from',              type:'text'},
    {id:'notes',        label:'Notes',             hint:'Free text',               type:'text'},
  ],

  // Default role suggestions per team.
  roles: [
    'Analyst', 'Senior Analyst', 'Coordinator', 'Specialist', 'Lead', 'Manager',
  ],

  // Helper: lookup a field def
  fieldDef(id) { return this.fields.find(f => f.id === id); },
  workUnitLabel(id, customLabels) {
    if (customLabels && customLabels[id]) return customLabels[id];
    const item = this.workUnits.find(w => w.id === id);
    return item ? item.label : id;
  }
};
