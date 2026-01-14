/**
 * Resume Template Style Configurations
 * Phase 1: First 4 templates (T1, P1, C1, M1)
 * Phase 2: Additional 8 templates (T2, T3, P2, P3, C2, C3, M2, M3)
 */

import type { TemplateStyle } from '../types';

/**
 * T1: Classic Blue (Traditional)
 */
export const classicBlueStyle: TemplateStyle = {
  primaryColor: '#1a365d',        // Deep Blue
  secondaryColor: '#2d5aa0',      // Medium Blue
  dividerColor: '#e5e7eb',        // Light Gray
  textColor: '#000000',           // Black
  backgroundColor: '#ffffff',     // White
  
  headerFont: 'Georgia, serif',
  bodyFont: 'Times New Roman, serif',
  contactFont: 'Arial, sans-serif',
  docxHeaderFont: 'Georgia',
  docxBodyFont: 'Times New Roman',
  docxContactFont: 'Arial',
  
  headerFontSize: 32,             // 16pt
  bodyFontSize: 22,               // 11pt
  contactFontSize: 20,            // 10pt
  headerFontWeight: 'bold',
  
  headerAlignment: 'center',
  contentAlignment: 'left',
  sectionSpacing: 240,
  
  headerStyle: 'underline',
  dividerStyle: 'line',
  showAccentBars: false,
};

/**
 * P1: Corporate Green (Professional)
 */
export const corporateGreenStyle: TemplateStyle = {
  primaryColor: '#065f46',        // Forest Green
  secondaryColor: '#10b981',      // Emerald
  dividerColor: '#9ca3af',       // Green-tinted gray
  textColor: '#000000',
  backgroundColor: '#ffffff',
  
  headerFont: 'Trebuchet MS, sans-serif',
  bodyFont: 'Segoe UI, sans-serif',
  contactFont: 'Arial Narrow, sans-serif',
  docxHeaderFont: 'Trebuchet MS',
  docxBodyFont: 'Segoe UI',
  docxContactFont: 'Arial Narrow',
  
  headerFontSize: 32,
  bodyFontSize: 22,
  contactFontSize: 20,
  headerFontWeight: 'bold',
  
  headerAlignment: 'left',
  contentAlignment: 'left',
  sectionSpacing: 240,
  
  headerStyle: 'background',
  dividerStyle: 'line',
  showAccentBars: true,
};

/**
 * C1: Minimalist White (Clean)
 */
export const minimalistWhiteStyle: TemplateStyle = {
  primaryColor: '#111827',        // Dark Gray
  secondaryColor: '#9ca3af',      // Light Gray
  dividerColor: '#e5e7eb',       // Thin gray lines
  textColor: '#000000',
  backgroundColor: '#ffffff',
  
  headerFont: 'Open Sans, sans-serif',
  bodyFont: 'Lato, sans-serif',
  contactFont: 'Roboto, sans-serif',
  docxHeaderFont: 'Arial',
  docxBodyFont: 'Arial',
  docxContactFont: 'Arial',
  
  headerFontSize: 32,
  bodyFontSize: 22,
  contactFontSize: 20,
  headerFontWeight: '700',
  
  headerAlignment: 'center',
  contentAlignment: 'left',
  sectionSpacing: 300,           // Generous spacing
  
  headerStyle: 'plain',
  dividerStyle: 'line',
  showAccentBars: false,
};

/**
 * M1: Tech Modern (Modern)
 */
export const techModernStyle: TemplateStyle = {
  primaryColor: '#5b21b6',        // Deep Purple
  secondaryColor: '#a855f7',      // Purple
  dividerColor: '#c4b5fd',       // Purple gradient lines
  textColor: '#000000',
  backgroundColor: '#ffffff',
  
  headerFont: 'Raleway, sans-serif',
  bodyFont: 'Poppins, sans-serif',
  contactFont: 'Nunito, sans-serif',
  docxHeaderFont: 'Arial',
  docxBodyFont: 'Arial',
  docxContactFont: 'Arial',
  
  headerFontSize: 36,             // Larger for modern feel
  bodyFontSize: 22,
  contactFontSize: 20,
  headerFontWeight: '800',
  
  headerAlignment: 'left',
  contentAlignment: 'left',
  sectionSpacing: 240,
  
  headerStyle: 'border',
  dividerStyle: 'gradient',
  showAccentBars: true,
};

/**
 * T2: Professional Navy (Traditional)
 */
export const professionalNavyStyle: TemplateStyle = {
  primaryColor: '#1e3a5f',        // Navy Blue
  secondaryColor: '#0f766e',      // Teal
  dividerColor: '#475569',       // Navy with thin line
  textColor: '#000000',
  backgroundColor: '#ffffff',
  
  headerFont: 'Garamond, serif',
  bodyFont: 'Book Antiqua, serif',
  contactFont: 'Calibri, sans-serif',
  docxHeaderFont: 'Garamond',
  docxBodyFont: 'Book Antiqua',
  docxContactFont: 'Calibri',
  
  headerFontSize: 32,
  bodyFontSize: 22,
  contactFontSize: 20,
  headerFontWeight: 'bold',
  
  headerAlignment: 'left',
  contentAlignment: 'justified',
  sectionSpacing: 200,
  
  layoutType: 'two-column-header',
  leftColumnWidth: 60,
  rightColumnWidth: 40,
  
  dateFormat: 'month-year',
  dateSeparator: ' - ',
  showPresent: true,
  
  bulletStyle: 'square',
  bulletCharacter: '■',
  
  headerStyle: 'underline',
  dividerStyle: 'line',
  showAccentBars: false,
};

/**
 * T3: Timeless Black (Traditional)
 */
export const timelessBlackStyle: TemplateStyle = {
  primaryColor: '#000000',        // Pure Black
  secondaryColor: '#4b5563',      // Dark Gray
  dividerColor: '#6b7280',       // Medium Gray
  textColor: '#000000',
  backgroundColor: '#ffffff',
  
  headerFont: 'Palatino Linotype, serif',
  bodyFont: 'Cambria, serif',
  contactFont: 'Verdana, sans-serif',
  docxHeaderFont: 'Palatino Linotype',
  docxBodyFont: 'Cambria',
  docxContactFont: 'Verdana',
  
  headerFontSize: 32,
  bodyFontSize: 22,
  contactFontSize: 20,
  headerFontWeight: 'bold',
  
  headerAlignment: 'left',
  contentAlignment: 'left',
  sectionSpacing: 180,
  
  dateFormat: 'year-only',
  dateSeparator: ' - ',
  showPresent: true,
  
  bulletStyle: 'round',
  
  headerStyle: 'background',
  dividerStyle: 'line',
  showAccentBars: true,
};

/**
 * P2: Executive Gray (Professional)
 */
export const executiveGrayStyle: TemplateStyle = {
  primaryColor: '#374151',        // Charcoal
  secondaryColor: '#475569',      // Slate Blue
  dividerColor: '#9ca3af',       // Gradient gray
  textColor: '#000000',
  backgroundColor: '#ffffff',
  
  headerFont: 'Franklin Gothic Medium, sans-serif',
  bodyFont: 'Century Gothic, sans-serif',
  contactFont: 'Tahoma, sans-serif',
  docxHeaderFont: 'Franklin Gothic Medium',
  docxBodyFont: 'Century Gothic',
  docxContactFont: 'Tahoma',
  
  headerFontSize: 32,
  bodyFontSize: 22,
  contactFontSize: 20,
  headerFontWeight: 'bold',
  
  headerAlignment: 'center',
  contentAlignment: 'left',
  sectionSpacing: 240,
  
  layoutType: 'two-column',
  leftColumnWidth: 50,
  rightColumnWidth: 50,
  
  dateFormat: 'month-year-long',
  dateSeparator: ' ',
  showPresent: true,
  
  bulletStyle: 'dash',
  bulletCharacter: '—',
  
  headerStyle: 'plain',
  dividerStyle: 'dotted',
  showAccentBars: false,
};

/**
 * P3: Business Blue (Professional)
 */
export const businessBlueStyle: TemplateStyle = {
  primaryColor: '#1e40af',        // Professional Blue
  secondaryColor: '#0ea5e9',      // Sky Blue
  dividerColor: '#93c5fd',       // Blue tinted
  textColor: '#000000',
  backgroundColor: '#ffffff',
  
  headerFont: 'Arial Black, sans-serif',
  bodyFont: 'Helvetica, sans-serif',
  contactFont: 'Lucida Sans, sans-serif',
  docxHeaderFont: 'Arial Black',
  docxBodyFont: 'Helvetica',
  docxContactFont: 'Lucida Sans',
  
  headerFontSize: 32,
  bodyFontSize: 22,
  contactFontSize: 20,
  headerFontWeight: 'bold',
  
  headerAlignment: 'left',
  contentAlignment: 'left',
  sectionSpacing: 220,
  
  dateFormat: 'numeric',
  dateSeparator: '/',
  showPresent: true,
  
  bulletStyle: 'square',
  bulletColor: '#1e40af',
  bulletCharacter: '▪',
  
  headerStyle: 'background',
  dividerStyle: 'line',
  showAccentBars: true,
};

/**
 * P4: Professional Split (Professional) - Two-Column Split with Sidebar Contact/Photo
 */
export const professionalSplitStyle: TemplateStyle = {
  primaryColor: '#1f2937',        // Slate
  secondaryColor: '#2563eb',      // Accent Blue
  dividerColor: '#d1d5db',       // Soft Gray
  textColor: '#111827',
  backgroundColor: '#ffffff',
  
  headerFont: 'Source Sans Pro, sans-serif',
  bodyFont: 'Inter, sans-serif',
  contactFont: 'Inter, sans-serif',
  docxHeaderFont: 'Calibri',
  docxBodyFont: 'Calibri',
  docxContactFont: 'Calibri',
  
  headerFontSize: 34,
  bodyFontSize: 22,
  contactFontSize: 20,
  headerFontWeight: '700',
  
  headerAlignment: 'left',
  contentAlignment: 'left',
  sectionSpacing: 240,
  
  layoutType: 'two-column-split',
  leftColumnWidth: 30,
  rightColumnWidth: 70,
  sidebarSections: ['skills', 'languages', 'certifications'],
  mainSections: ['summary', 'experience', 'projects', 'education'],
  
  contactPlacement: 'sidebar',
  
  dateFormat: 'month-year',
  dateSeparator: ' - ',
  showPresent: true,
  
  bulletStyle: 'round',
  bulletColor: '#2563eb',
  bulletCharacter: '•',
  
  headerStyle: 'background',
  dividerStyle: 'line',
  showAccentBars: false,
};

/**
 * C2: Modern Minimal (Clean)
 */
export const modernMinimalStyle: TemplateStyle = {
  primaryColor: '#1f2937',        // Charcoal
  secondaryColor: '#93c5fd',      // Soft Blue
  dividerColor: '#e5e7eb',       // Dotted gray
  textColor: '#000000',
  backgroundColor: '#ffffff',
  
  headerFont: 'Montserrat, sans-serif',
  bodyFont: 'Source Sans Pro, sans-serif',
  contactFont: 'Inter, sans-serif',
  docxHeaderFont: 'Arial',
  docxBodyFont: 'Arial',
  docxContactFont: 'Arial',
  
  headerFontSize: 32,
  bodyFontSize: 22,
  contactFontSize: 20,
  headerFontWeight: '700',
  
  headerAlignment: 'center',
  contentAlignment: 'left',
  sectionSpacing: 280,
  
  dateFormat: 'month-year-short',
  dateSeparator: ' ',
  showPresent: true,
  
  bulletStyle: 'custom',
  bulletColor: '#93c5fd',
  bulletCharacter: '•',
  
  headerStyle: 'plain',
  dividerStyle: 'dotted',
  showAccentBars: false,
};

/**
 * C3: Clean Serif (Clean)
 */
export const cleanSerifStyle: TemplateStyle = {
  primaryColor: '#0f172a',        // Almost Black
  secondaryColor: '#64748b',      // Slate
  dividerColor: '#cbd5e1',       // Subtle gray
  textColor: '#000000',
  backgroundColor: '#ffffff',
  
  headerFont: 'Merriweather, serif',
  bodyFont: 'Lora, serif',
  contactFont: 'Work Sans, sans-serif',
  docxHeaderFont: 'Times New Roman',
  docxBodyFont: 'Times New Roman',
  docxContactFont: 'Arial',
  
  headerFontSize: 32,
  bodyFontSize: 22,
  contactFontSize: 20,
  headerFontWeight: 'bold',
  
  headerAlignment: 'center',
  contentAlignment: 'left',
  sectionSpacing: 320,
  
  dateFormat: 'year-present',
  dateSeparator: ' - ',
  showPresent: true,
  
  bulletStyle: 'round',
  
  headerStyle: 'plain',
  dividerStyle: 'line',
  showAccentBars: false,
};

export const creativeBoldStyle: TemplateStyle = {
  // Creative bold layout inspired by "My Resume 279", adapted for WHITE background
  primaryColor: '#ef4444',        // Bright red for name and section headers
  secondaryColor: '#f97316',      // Orange accent (for lines / highlights)
  dividerColor: '#e5e7eb',        // Light gray for inner borders / column divider
  textColor: '#111827',           // Dark text for readability on white
  backgroundColor: '#ffffff',     // White background (printer & ATS friendly)
  
  headerFont: 'Bebas Neue, sans-serif',
  bodyFont: 'Roboto Condensed, sans-serif',
  contactFont: 'Oswald, sans-serif',
  docxHeaderFont: 'Arial Black',
  docxBodyFont: 'Arial Narrow',
  docxContactFont: 'Arial',
  
  headerFontSize: 36,
  bodyFontSize: 22,
  contactFontSize: 20,
  headerFontWeight: '800',
  
  headerAlignment: 'left',
  contentAlignment: 'left',
  sectionSpacing: 220,
  
  layoutType: 'two-column-sidebar',
  leftColumnWidth: 30,
  rightColumnWidth: 70,
  sidebarSections: ['skills', 'languages'],
  mainSections: ['summary', 'experience', 'education', 'projects', 'certifications'],
  
  dateFormat: 'month-year',
  dateSeparator: ' ',
  showPresent: true,
  
  bulletStyle: 'custom',
  bulletColor: '#ef4444',
  bulletCharacter: '•',
  
  headerStyle: 'plain',
  dividerStyle: 'line',
  showAccentBars: false,
};

/**
 * M3: Sleek Dark (Modern) - 3-Column Layout
 */
export const sleekDarkStyle: TemplateStyle = {
  primaryColor: '#1e293b',        // Dark Slate
  secondaryColor: '#06b6d4',      // Cyan
  dividerColor: '#06b6d4',       // Cyan lines
  textColor: '#000000',
  backgroundColor: '#ffffff',
  
  headerFont: 'DM Sans, sans-serif',
  bodyFont: 'Inter, sans-serif',
  contactFont: 'Space Grotesk, sans-serif',
  docxHeaderFont: 'Arial',
  docxBodyFont: 'Arial',
  docxContactFont: 'Arial',
  
  headerFontSize: 32,
  bodyFontSize: 20,
  contactFontSize: 18,
  headerFontWeight: 'bold',
  
  headerAlignment: 'center',
  contentAlignment: 'left',
  sectionSpacing: 180,
  
  layoutType: 'three-column',
  leftColumnWidth: 25,
  middleColumnWidth: 50,
  rightColumnWidth: 25,
  
  dateFormat: 'year-only',
  dateSeparator: '',
  showPresent: false,
  
  bulletStyle: 'arrow',
  bulletColor: '#06b6d4',
  bulletCharacter: '▸',
  
  headerStyle: 'plain',
  dividerStyle: 'line',
  showAccentBars: false,
};

