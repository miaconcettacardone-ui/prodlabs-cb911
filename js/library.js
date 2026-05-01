/* ============================================================
 *  library.js — pre-built options the wizard offers
 *  ============================================================
 *  Devs: extend these arrays to add more options without
 *  touching wizard code.
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
