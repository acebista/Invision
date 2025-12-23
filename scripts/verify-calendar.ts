/**
 * Quick verification of the updated nepaliCalendar module
 */

import {
    bsToAd,
    adToBs,
    convertFromBS,
    convertFromAD,
    detectCalendar,
    getFiscalYear,
    getCurrentBSDate,
    getToday,
    formatBSDateLong
} from '../lib/nepaliCalendar';

console.log('='.repeat(50));
console.log('NEPALI CALENDAR MODULE VERIFICATION');
console.log('='.repeat(50));

// Test 1: bsToAd
console.log('\n1. BS to AD Conversion:');
const bs1 = { year: 2082, month: 9, day: 7 };
const ad1 = bsToAd(bs1);
console.log(`   ${bs1.year}/${bs1.month}/${bs1.day} → ${ad1?.year}-${ad1?.month}-${ad1?.day}`);

// Test 2: adToBs
console.log('\n2. AD to BS Conversion:');
const ad2 = { year: 2025, month: 12, day: 22 };
const bs2 = adToBs(ad2);
console.log(`   ${ad2.year}-${ad2.month}-${ad2.day} → ${bs2?.year}/${bs2?.month}/${bs2?.day}`);

// Test 3: String conversion
console.log('\n3. String Conversion:');
const fromBs = convertFromBS('2082/09/07');
console.log(`   BS "2082/09/07" → AD "${fromBs?.adFormatted}"`);

const fromAd = convertFromAD('2025-12-22');
console.log(`   AD "2025-12-22" → BS "${fromAd?.bsFormatted}"`);

// Test 4: Calendar detection
console.log('\n4. Calendar Detection:');
console.log(`   "2082/09/07" → ${detectCalendar('2082/09/07')}`);
console.log(`   "2025-12-22" → ${detectCalendar('2025-12-22')}`);
console.log(`   "2030/05/15" → ${detectCalendar('2030/05/15')}`);

// Test 5: Fiscal year
console.log('\n5. Fiscal Year:');
console.log(`   2082/09/07 → FY ${getFiscalYear({ year: 2082, month: 9, day: 7 })}`);
console.log(`   2082/02/15 → FY ${getFiscalYear({ year: 2082, month: 2, day: 15 })}`);

// Test 6: Current date
console.log('\n6. Current Date:');
const today = getToday();
console.log(`   BS: ${today.bsFormatted}`);
console.log(`   AD: ${today.adFormatted}`);
console.log(`   Long: ${formatBSDateLong(today.bs)}`);

// Test 7: Current BS date
console.log('\n7. Current BS Date:');
const currentBs = getCurrentBSDate();
console.log(`   Year: ${currentBs.year}, Month: ${currentBs.month}, Day: ${currentBs.day}`);

console.log('\n' + '='.repeat(50));
console.log('VERIFICATION COMPLETE ✓');
console.log('='.repeat(50));
