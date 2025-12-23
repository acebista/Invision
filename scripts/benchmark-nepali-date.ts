/**
 * Benchmark: nepali-date-converter package evaluation
 * 
 * Tests:
 * 1. Single conversion (BS → AD and AD → BS)
 * 2. Bulk conversion (10,000 dates)
 * 3. Edge cases
 * 4. API comparison with our implementation
 */

import NepaliDate from 'nepali-date-converter';

console.log('='.repeat(60));
console.log('NEPALI-DATE-CONVERTER BENCHMARK');
console.log('='.repeat(60));
console.log();

// -------------------------------------------------------------------
// TEST 1: Single Conversion
// -------------------------------------------------------------------

console.log('TEST 1: Single Conversion');
console.log('-'.repeat(40));

// BS to AD
try {
    const bsDate = new NepaliDate(2082, 8, 7); // 2082/09/07 (month is 0-indexed)
    console.log(`BS Input: 2082/09/07`);
    console.log(`BS Object: ${bsDate.format('YYYY/MM/DD')}`);

    const adDate = bsDate.getAD();
    console.log(`AD Output: ${adDate.year}-${String(adDate.month + 1).padStart(2, '0')}-${String(adDate.date).padStart(2, '0')}`);
    console.log();
} catch (e: any) {
    console.error('BS→AD Error:', e.message);
}

// AD to BS
try {
    const adDate = new Date(2025, 11, 22); // Dec 22, 2025
    const npDate = new NepaliDate(adDate);
    console.log(`AD Input: 2025-12-22`);
    console.log(`BS Output: ${npDate.format('YYYY/MM/DD')}`);
    console.log();
} catch (e: any) {
    console.error('AD→BS Error:', e.message);
}

// -------------------------------------------------------------------
// TEST 2: API Exploration
// -------------------------------------------------------------------

console.log('TEST 2: API Exploration');
console.log('-'.repeat(40));

const testDate = new NepaliDate(2082, 8, 7);
console.log('Methods available:');
console.log(`  format('YYYY/MM/DD'): ${testDate.format('YYYY/MM/DD')}`);
console.log(`  format('MMMM D, YYYY'): ${testDate.format('MMMM D, YYYY')}`);
console.log(`  getYear(): ${testDate.getYear()}`);
console.log(`  getMonth(): ${testDate.getMonth()} (0-indexed)`);
console.log(`  getDate(): ${testDate.getDate()}`);
console.log(`  getDay(): ${testDate.getDay()} (day of week)`);
console.log(`  getBS(): ${JSON.stringify(testDate.getBS())}`);
console.log(`  getAD(): ${JSON.stringify(testDate.getAD())}`);
console.log();

// -------------------------------------------------------------------
// TEST 3: Bulk Conversion Performance (10,000 dates)
// -------------------------------------------------------------------

console.log('TEST 3: Bulk Conversion Performance');
console.log('-'.repeat(40));

const iterations = 10000;

// BS to AD conversions
console.log(`\nConverting ${iterations} BS dates to AD...`);
const bsToAdStart = performance.now();

for (let i = 0; i < iterations; i++) {
    const year = 2070 + Math.floor(i / 365) % 15; // Years 2070-2084
    const month = i % 12;
    const day = (i % 28) + 1;

    try {
        const npDate = new NepaliDate(year, month, day);
        const ad = npDate.getAD();
        // Access values to ensure computation happens
        const _ = ad.year + ad.month + ad.date;
    } catch {
        // Some dates may be invalid, continue
    }
}

const bsToAdEnd = performance.now();
const bsToAdTime = bsToAdEnd - bsToAdStart;
console.log(`  Time: ${bsToAdTime.toFixed(2)}ms`);
console.log(`  Rate: ${(iterations / (bsToAdTime / 1000)).toFixed(0)} conversions/second`);
console.log(`  Per conversion: ${(bsToAdTime / iterations).toFixed(4)}ms`);

// AD to BS conversions
console.log(`\nConverting ${iterations} AD dates to BS...`);
const adToBsStart = performance.now();

for (let i = 0; i < iterations; i++) {
    const year = 2015 + Math.floor(i / 365) % 10; // Years 2015-2024
    const month = i % 12;
    const day = (i % 28) + 1;

    try {
        const adDate = new Date(year, month, day);
        const npDate = new NepaliDate(adDate);
        const bs = npDate.getBS();
        const _ = bs.year + bs.month + bs.date;
    } catch {
        // Continue on error
    }
}

const adToBsEnd = performance.now();
const adToBsTime = adToBsEnd - adToBsStart;
console.log(`  Time: ${adToBsTime.toFixed(2)}ms`);
console.log(`  Rate: ${(iterations / (adToBsTime / 1000)).toFixed(0)} conversions/second`);
console.log(`  Per conversion: ${(adToBsTime / iterations).toFixed(4)}ms`);

// -------------------------------------------------------------------
// TEST 4: Edge Cases
// -------------------------------------------------------------------

console.log('\nTEST 4: Edge Cases');
console.log('-'.repeat(40));

const edgeCases = [
    { year: 2000, month: 0, day: 1, label: 'Min supported (2000/01/01)' },
    { year: 2090, month: 11, day: 30, label: 'Near max (2090/12/30)' },
    { year: 2082, month: 0, day: 1, label: 'New Year 2082 (Baisakh 1)' },
    { year: 2082, month: 3, day: 1, label: 'Fiscal Year Start (Shrawan 1)' },
    { year: 2081, month: 2, day: 32, label: 'Max days in Ashadh 2081' },
];

for (const tc of edgeCases) {
    try {
        const np = new NepaliDate(tc.year, tc.month, tc.day);
        const ad = np.getAD();
        console.log(`  ${tc.label}`);
        console.log(`    BS: ${np.format('YYYY/MM/DD')} → AD: ${ad.year}-${String(ad.month + 1).padStart(2, '0')}-${String(ad.date).padStart(2, '0')}`);
    } catch (e: any) {
        console.log(`  ${tc.label}: ERROR - ${e.message}`);
    }
}

// -------------------------------------------------------------------
// TEST 5: Comparison with custom dates
// -------------------------------------------------------------------

console.log('\nTEST 5: Known Date Verification');
console.log('-'.repeat(40));

// Known correspondences (verified)
const knownDates = [
    { bs: '2082/09/07', expectedAd: '2025-12-22' },
    { bs: '2081/01/01', expectedAd: '2024-04-13' },
    { bs: '2080/01/01', expectedAd: '2023-04-14' },
];

for (const kd of knownDates) {
    const [y, m, d] = kd.bs.split('/').map(Number);
    const np = new NepaliDate(y, m - 1, d); // month is 0-indexed
    const ad = np.getAD();
    const adStr = `${ad.year}-${String(ad.month + 1).padStart(2, '0')}-${String(ad.date).padStart(2, '0')}`;
    const match = adStr === kd.expectedAd ? '✓' : '✗';
    console.log(`  ${kd.bs} → ${adStr} (expected: ${kd.expectedAd}) ${match}`);
}

console.log();
console.log('='.repeat(60));
console.log('BENCHMARK COMPLETE');
console.log('='.repeat(60));
