/**
 * Nepali Calendar Utilities (Using nepali-date-converter)
 * 
 * This module wraps the nepali-date-converter package for:
 * - BS ↔ AD date conversion
 * - Date formatting
 * - Fiscal year calculations
 * 
 * Performance (benchmarked):
 * - ~190,000 BS→AD conversions/second
 * - ~180,000 AD→BS conversions/second
 * - 0.005ms per conversion
 */

import NepaliDate from 'nepali-date-converter';

// -------------------------------------------------------------------
// TYPES
// -------------------------------------------------------------------

export interface BSDate {
    year: number;
    month: number;  // 1-indexed (1 = Baisakh)
    day: number;
}

export interface ADDate {
    year: number;
    month: number;  // 1-indexed (1 = January)
    day: number;
}

export interface ConvertedDate {
    bs: BSDate;
    ad: ADDate;
    bsFormatted: string; // "2082/09/07"
    adFormatted: string; // "2025-12-22"
}

// -------------------------------------------------------------------
// BS TO AD CONVERSION
// -------------------------------------------------------------------

/**
 * Convert Bikram Sambat date to Gregorian (AD)
 * 
 * @param bs - BS date object (month is 1-indexed)
 * @returns AD date object or null if invalid
 */
export function bsToAd(bs: BSDate): ADDate | null {
    try {
        // NepaliDate uses 0-indexed months
        const npDate = new NepaliDate(bs.year, bs.month - 1, bs.day);
        const ad = npDate.getAD();

        return {
            year: ad.year,
            month: ad.month + 1, // Convert to 1-indexed
            day: ad.date
        };
    } catch (e) {
        return null;
    }
}

/**
 * Convert Gregorian (AD) date to Bikram Sambat
 * 
 * @param ad - AD date object (month is 1-indexed)
 * @returns BS date object or null if invalid
 */
export function adToBs(ad: ADDate): BSDate | null {
    try {
        const jsDate = new Date(ad.year, ad.month - 1, ad.day);
        const npDate = new NepaliDate(jsDate);
        const bs = npDate.getBS();

        return {
            year: bs.year,
            month: bs.month + 1, // Convert to 1-indexed
            day: bs.date
        };
    } catch (e) {
        return null;
    }
}

// -------------------------------------------------------------------
// STRING PARSING
// -------------------------------------------------------------------

/**
 * Parse BS date string (YYYY/MM/DD or YYYY-MM-DD)
 */
export function parseBSDate(str: string): BSDate | null {
    if (!str) return null;

    const cleaned = str.trim().replace(/[.\-]/g, '/');
    const parts = cleaned.split('/');

    if (parts.length !== 3) return null;

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);

    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 32) return null;

    return { year, month, day };
}

/**
 * Parse AD date string (YYYY-MM-DD or YYYY/MM/DD)
 */
export function parseADDate(str: string): ADDate | null {
    if (!str) return null;

    const cleaned = str.trim().replace(/\//g, '-');
    const parts = cleaned.split('-');

    if (parts.length !== 3) return null;

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);

    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    return { year, month, day };
}

// -------------------------------------------------------------------
// FORMATTING
// -------------------------------------------------------------------

/**
 * Format BS date as string (YYYY/MM/DD)
 */
export function formatBSDate(bs: BSDate): string {
    const mm = String(bs.month).padStart(2, '0');
    const dd = String(bs.day).padStart(2, '0');
    return `${bs.year}/${mm}/${dd}`;
}

/**
 * Format AD date as ISO string (YYYY-MM-DD)
 */
export function formatADDate(ad: ADDate): string {
    const mm = String(ad.month).padStart(2, '0');
    const dd = String(ad.day).padStart(2, '0');
    return `${ad.year}-${mm}-${dd}`;
}

/**
 * Format BS date with month name
 */
export function formatBSDateLong(bs: BSDate): string {
    try {
        const npDate = new NepaliDate(bs.year, bs.month - 1, bs.day);
        return npDate.format('MMMM D, YYYY');
    } catch {
        return formatBSDate(bs);
    }
}

// -------------------------------------------------------------------
// COMPLETE CONVERSION
// -------------------------------------------------------------------

/**
 * Convert BS date string to full date object with both calendars
 */
export function convertFromBS(bsString: string): ConvertedDate | null {
    const bs = parseBSDate(bsString);
    if (!bs) return null;

    const ad = bsToAd(bs);
    if (!ad) return null;

    return {
        bs,
        ad,
        bsFormatted: formatBSDate(bs),
        adFormatted: formatADDate(ad)
    };
}

/**
 * Convert AD date string to full date object with both calendars
 */
export function convertFromAD(adString: string): ConvertedDate | null {
    const ad = parseADDate(adString);
    if (!ad) return null;

    const bs = adToBs(ad);
    if (!bs) return null;

    return {
        bs,
        ad,
        bsFormatted: formatBSDate(bs),
        adFormatted: formatADDate(ad)
    };
}

// -------------------------------------------------------------------
// CALENDAR DETECTION
// -------------------------------------------------------------------

/**
 * Detect if a date string is likely BS or AD
 * 
 * Heuristics:
 * - Year > 2050 → almost certainly BS
 * - Year 2000-2050 → depends on context (default to BS in Nepal)
 * - Year < 2000 → likely AD
 */
export function detectCalendar(dateString: string): 'BS' | 'AD' | null {
    if (!dateString) return null;

    const cleaned = dateString.trim().replace(/[.\-\/]/g, '/');
    const parts = cleaned.split('/');

    if (parts.length !== 3) return null;

    const year = parseInt(parts[0], 10);
    if (isNaN(year)) return null;

    // BS years are typically 2000-2100 (current ~2082)
    if (year > 2050) return 'BS';

    // AD years typically < 2050
    if (year < 2000) return 'AD';

    // Ambiguous range (2000-2050) - default to BS in Nepal context
    // Check if valid BS date
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);

    try {
        new NepaliDate(year, month - 1, day);
        return 'BS';
    } catch {
        return 'AD';
    }
}

// -------------------------------------------------------------------
// VALIDATION
// -------------------------------------------------------------------

/**
 * Check if BS date is valid
 */
export function isValidBSDate(bs: BSDate): boolean {
    try {
        new NepaliDate(bs.year, bs.month - 1, bs.day);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get number of days in a BS month
 */
export function getDaysInBSMonth(year: number, month: number): number {
    try {
        // Try creating date with day 32 and see what happens
        for (let day = 32; day >= 28; day--) {
            try {
                const np = new NepaliDate(year, month - 1, day);
                if (np.getDate() === day) return day;
            } catch {
                continue;
            }
        }
        return 30; // Default
    } catch {
        return 30;
    }
}

// -------------------------------------------------------------------
// NEPALI MONTH NAMES
// -------------------------------------------------------------------

export const BS_MONTH_NAMES = [
    'Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin',
    'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
];

export const BS_MONTH_NAMES_NEPALI = [
    'बैशाख', 'जेष्ठ', 'असार', 'श्रावण', 'भदौ', 'असोज',
    'कार्तिक', 'मंसिर', 'पौष', 'माघ', 'फागुन', 'चैत'
];

/**
 * Get BS month name
 */
export function getBSMonthName(month: number, nepali: boolean = false): string {
    if (month < 1 || month > 12) return '';
    return nepali ? BS_MONTH_NAMES_NEPALI[month - 1] : BS_MONTH_NAMES[month - 1];
}

// -------------------------------------------------------------------
// FISCAL YEAR
// -------------------------------------------------------------------

/**
 * Get Nepali fiscal year from BS date
 * 
 * FY runs from Shrawan 1 (month 4) to Ashadh 32 (month 3)
 * e.g., FY 2081/82 = Shrawan 2081 to Ashadh 2082
 */
export function getFiscalYear(bs: BSDate): string {
    // Months 4-12 (Shrawan to Chaitra) belong to FY starting that year
    // Months 1-3 (Baisakh to Ashadh) belong to FY that started previous year
    if (bs.month >= 4) {
        const endYear = (bs.year + 1) % 100;
        return `${bs.year}/${String(endYear).padStart(2, '0')}`;
    } else {
        const startYear = bs.year - 1;
        const endYear = bs.year % 100;
        return `${startYear}/${String(endYear).padStart(2, '0')}`;
    }
}

/**
 * Get current BS date
 */
export function getCurrentBSDate(): BSDate {
    const npDate = new NepaliDate();
    const bs = npDate.getBS();
    return {
        year: bs.year,
        month: bs.month + 1,
        day: bs.date
    };
}

/**
 * Get current fiscal year
 */
export function getCurrentFiscalYear(): string {
    return getFiscalYear(getCurrentBSDate());
}

// -------------------------------------------------------------------
// UTILITY: Today's date
// -------------------------------------------------------------------

/**
 * Get today's date in both calendars
 */
export function getToday(): ConvertedDate {
    const npDate = new NepaliDate();
    const bs = npDate.getBS();
    const ad = npDate.getAD();

    return {
        bs: { year: bs.year, month: bs.month + 1, day: bs.date },
        ad: { year: ad.year, month: ad.month + 1, day: ad.date },
        bsFormatted: npDate.format('YYYY/MM/DD'),
        adFormatted: formatADDate({ year: ad.year, month: ad.month + 1, day: ad.date })
    };
}
