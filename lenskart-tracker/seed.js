// Sample data for the demo. All projects, owners and figures are fictional
// (written to look plausible for an eyewear omnichannel retailer).
// Dates are relative to "now" so the demo always looks current.
// [function, project, owner, status, startDaysAgo, dueInDays, progress%, lastUpdateDaysAgo, latest note]
const rows = [
  ['Retail Expansion', 'Open 40 stores in Tier-2 North India', 'Ananya Rao', 'On track', 120, 45, 70, 2, '31 of 40 sites signed; fit-outs on schedule.'],
  ['Retail Expansion', 'Store refit: 25 legacy Mumbai stores', 'Ananya Rao', 'At risk', 90, 12, 48, 4, 'Contractor shortage; 9 refits slipping into December.'],
  ['Retail Expansion', 'Franchise partner onboarding portal', 'Kabir Malhotra', 'On track', 60, 30, 55, 3, 'UAT with 6 franchisees this week.'],
  ['Retail Expansion', 'GCC flagship store, Dubai Mall', 'Kabir Malhotra', 'On track', 150, 70, 60, 9, 'Lease signed; awaiting design sign-off.'],
  ['Supply Chain', 'Bhiwadi plant lens-capacity expansion', 'Rohit Iyer', 'Blocked', 100, 20, 52, 3, 'Coating machines held at customs; no release date.'],
  ['Supply Chain', 'Same-day delivery in 6 metros', 'Rohit Iyer', 'At risk', 75, 9, 60, 1, 'Hyderabad and Pune last-mile partner not yet contracted.'],
  ['Supply Chain', 'Frame SKU rationalisation (-15%)', 'Meera Pillai', 'On track', 40, 50, 35, 5, 'Long-tail analysis complete; delist list with Category.'],
  ['Supply Chain', 'Regional warehouse, Kolkata', 'Meera Pillai', 'On track', 180, 90, 40, 16, 'Site handover done.'],
  ['Tech & App', 'App checkout revamp (one-tap UPI)', 'Siddharth Jain', 'On track', 50, 18, 75, 2, 'A/B test live at 20% traffic; +3.1% conversion.'],
  ['Tech & App', '3D virtual try-on v2', 'Siddharth Jain', 'At risk', 110, 25, 45, 6, 'Face-mesh accuracy below target on low-end Android.'],
  ['Tech & App', 'Store POS migration to cloud', 'Tanvi Deshmukh', 'Blocked', 80, 6, 58, 2, 'Payment gateway certification failed; vendor re-test pending.'],
  ['Tech & App', 'Personalised home feed', 'Tanvi Deshmukh', 'On track', 30, 60, 25, 4, 'Model trained; offline metrics good.'],
  ['Marketing', 'Festive campaign: "See the Light"', 'Ishita Kapoor', 'On track', 45, 8, 85, 1, 'TV and digital assets approved.'],
  ['Marketing', 'Gold membership relaunch', 'Ishita Kapoor', 'At risk', 70, 15, 50, 11, 'Pricing not yet approved by Finance.'],
  ['Marketing', 'Influencer program, 500 creators', 'Arjun Mehta', 'On track', 35, 40, 40, 3, '212 creators contracted.'],
  ['Marketing', 'Brand tracker study, wave 2', 'Arjun Mehta', 'Done', 60, -5, 100, 6, 'Readout shared with leadership.'],
  ['Manufacturing', 'Blue-cut lens yield improvement', 'Vikram Shetty', 'On track', 90, 35, 62, 2, 'Yield up from 91% to 94.5%.'],
  ['Manufacturing', 'New frame-moulding line', 'Vikram Shetty', 'At risk', 130, 14, 55, 8, 'Mould trials failing tolerance on 2 of 6 designs.'],
  ['Manufacturing', 'ISO 13485 recertification', 'Priya Nair', 'On track', 60, 22, 70, 4, 'Internal audit closed with 3 minor findings.'],
  ['Manufacturing', 'Contact-lens packaging redesign', 'Priya Nair', 'On track', 40, 75, 20, 19, 'Vendor shortlist made.'],
  ['Finance', 'Quarterly close in 5 working days', 'Neha Bansal', 'On track', 100, 20, 80, 3, 'Q2 closed in 6 days, down from 9.'],
  ['Finance', 'Store-level P&L dashboard', 'Neha Bansal', 'At risk', 85, -3, 70, 5, 'Missed go-live; rent allocation logic disputed.'],
  ['Finance', 'Working-capital release, INR 120 Cr', 'Aditya Sinha', 'On track', 120, 60, 50, 7, 'INR 54 Cr released via inventory days.'],
  ['Finance', 'GST e-invoicing for franchise billing', 'Aditya Sinha', 'Done', 90, -10, 100, 12, 'Live for all franchisees.'],
  ['HR', 'Hire 600 optometrists before festive season', 'Sana Qureshi', 'At risk', 100, 10, 61, 2, '366 hired; South region offer acceptance at 48%.'],
  ['HR', 'Store-manager leadership academy', 'Sana Qureshi', 'On track', 50, 45, 40, 6, 'Cohort 1 (60 managers) started.'],
  ['HR', 'HRMS migration', 'Karan Verma', 'On track', 70, 28, 55, 3, 'Payroll parallel run passed.'],
  ['HR', 'Attrition deep-dive: retail staff', 'Karan Verma', 'On track', 20, 15, 30, 15, 'Exit-interview data collected.'],
  ['Customer Experience', 'Cut eye-test wait time to under 10 min', 'Rhea Fernandes', 'On track', 60, 30, 55, 2, 'Pilot in 40 stores: median 12 min to 8 min.'],
  ['Customer Experience', 'Returns automation (WhatsApp)', 'Rhea Fernandes', 'At risk', 55, 7, 45, 3, 'Courier API integration delayed by partner.'],
  ['Customer Experience', 'NPS program: post-delivery survey', 'Dev Khanna', 'On track', 40, 35, 50, 4, 'Response rate 18%.'],
  ['Customer Experience', 'Call-centre GenAI assist pilot', 'Dev Khanna', 'On track', 30, 50, 30, 10, 'Vendor selected.'],
];

const DAY = 86400000;
function seedProjects(now = Date.now()) {
  return rows.map((r, i) => {
    const [fn, name, owner, status, startAgo, dueIn, progress, updAgo, note] = r;
    const iso = (d) => new Date(now + d * DAY).toISOString().slice(0, 10);
    const updatedAt = new Date(now - updAgo * DAY).toISOString();
    return {
      id: 'P' + String(i + 1).padStart(3, '0'),
      function: fn, name, owner, status,
      startDate: iso(-startAgo), dueDate: iso(dueIn), progress,
      updatedAt,
      updates: [{ at: updatedAt, by: owner, status, progress, note }],
    };
  });
}

module.exports = { seedProjects };
