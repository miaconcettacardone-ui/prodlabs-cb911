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

  // Departments (shown as a dropdown)
  departments: [
    'Sales','Alerts','Production','Client Relations','Finance',
    'Setup','Development','Operations','Marketing','Support',
    'HR','Legal','QA','Risk',
  ],

  // Work units (pickable; can also add custom)
  workUnits: [
    {id:'chargeback_case',  label:'Chargeback Case',  hint:'Disputes worked'},
    {id:'representment',    label:'Representment',    hint:'Rebuttals submitted'},
    {id:'alert_resolved',   label:'Alert Resolved',   hint:'Ethoca/RDR/CDRN'},
    {id:'sales_call',       label:'Sales Call',       hint:'Outbound/inbound'},
    {id:'demo_booked',      label:'Demo Booked',      hint:'Sales demos scheduled'},
    {id:'deal_closed',      label:'Deal Closed',      hint:'Revenue wins'},
    {id:'ticket_resolved',  label:'Support Ticket',   hint:'Issues resolved'},
    {id:'client_onboarded', label:'Client Onboarded', hint:'New accounts'},
    {id:'deployment',       label:'Deployment',       hint:'Code shipped'},
    {id:'pr_merged',        label:'PR Merged',        hint:'Pull requests done'},
    {id:'qa_review',        label:'QA Review',        hint:'Quality checks'},
    {id:'report_delivered', label:'Report Delivered', hint:'Client reports'},
    {id:'invoice_processed',label:'Invoice Processed',hint:'Finance task'},
    {id:'meeting_held',     label:'Client Meeting',   hint:'Check-ins/reviews'},
  ],

  // Fields tracked per record
  fields: [
    {id:'amount',       label:'Dollar Amount',     hint:'$ value',          type:'number'},
    {id:'outcome',      label:'Outcome',           hint:'Win/Loss/Pending', type:'enum', options:['Win','Loss','Pending']},
    {id:'reason_code',  label:'Reason Code',       hint:'10.4, 4853, etc',  type:'text'},
    {id:'card_network', label:'Card Network',      hint:'Visa/MC/Amex',     type:'enum', options:['Visa','Mastercard','Amex','Discover','Other']},
    {id:'merchant',     label:'Merchant / Client', hint:'Which client',     type:'text'},
    {id:'case_id',      label:'Case / Record ID',  hint:'Unique identifier',type:'text'},
    {id:'duration',     label:'Duration (min)',    hint:'Time spent',       type:'number'},
    {id:'priority',     label:'Priority',          hint:'High/Med/Low',     type:'enum', options:['High','Medium','Low']},
    {id:'status',       label:'Status',            hint:'Open/InProg/Done', type:'enum', options:['Open','In Progress','Done']},
    {id:'source',       label:'Source',            hint:'Where from',       type:'text'},
    {id:'notes',        label:'Notes',             hint:'Free text',        type:'text'},
  ],

  // Default role suggestions
  roles: [
    'Analyst','Senior Analyst','Team Lead','Specialist','Coordinator',
    'Representative','Sr. Rep','Account Manager','Developer','QA Engineer',
    'Manager','Director',
  ],

  // Helper: lookup a field def
  fieldDef(id) { return this.fields.find(f => f.id === id); },
  workUnitLabel(id, customLabels) {
    if (customLabels && customLabels[id]) return customLabels[id];
    const item = this.workUnits.find(w => w.id === id);
    return item ? item.label : id;
  }
};
