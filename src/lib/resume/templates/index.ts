/**
 * Resume Templates Registry
 * ATS-friendly templates inspired by resume.io
 * Phase 1: 4 distinct templates (T1, P1, C1, M1)
 * Phase 2: 8 additional templates (T2, T3, P2, P3, C2, C3, M2, M3)
 */

import type { TemplateMetadata } from '../types';
import { 
  classicBlueStyle,
  professionalSplitStyle,
  modernMinimalStyle,
  techModernStyle,
  creativeBoldStyle
} from './configs';

export const TEMPLATES: TemplateMetadata[] = [
  // Traditional
  {
    id: 'traditional-classic-blue',
    name: 'Classic Blue',
    description: 'Timeless traditional template with deep blue accents and serif typography. Perfect for any industry.',
    category: 'traditional',
    atsCompliant: true,
    style: classicBlueStyle,
    sections: [
      { id: 'personalInfo', title: 'Personal Information', required: true, order: 1 },
      { id: 'summary', title: 'Professional Summary', required: false, order: 2 },
      { id: 'experience', title: 'Work Experience', required: true, order: 3, maxItems: 10 },
      { id: 'education', title: 'Education', required: true, order: 4, maxItems: 10 },
      { id: 'skills', title: 'Skills', required: true, order: 5 },
      { id: 'certifications', title: 'Certifications', required: false, order: 6 },
      { id: 'projects', title: 'Projects', required: false, order: 7 },
    ]
  },
  // Professional
  {
    id: 'professional-two-column-split',
    name: 'Professional Split',
    description: 'ATS-friendly two-column professional layout with fixed 30/70 split and dedicated sidebar contact block.',
    category: 'professional',
    atsCompliant: true,
    style: professionalSplitStyle,
    sections: [
      { id: 'personalInfo', title: 'Personal Information', required: true, order: 1 },
      { id: 'summary', title: 'Professional Summary', required: false, order: 2 },
      { id: 'experience', title: 'Professional Experience', required: true, order: 3, maxItems: 10 },
      { id: 'projects', title: 'Projects', required: false, order: 4 },
      { id: 'education', title: 'Education & Training', required: true, order: 5, maxItems: 10 },
      { id: 'skills', title: 'Skills', required: true, order: 6 },
      { id: 'languages', title: 'Languages', required: false, order: 7 },
      { id: 'certifications', title: 'Certifications', required: false, order: 8 },
    ]
  },
  // Clean
  {
    id: 'clean-modern-minimal',
    name: 'Modern Minimal',
    description: 'Ultra-modern clean design with soft blue accents, dotted dividers, and maximum white space.',
    category: 'clean',
    atsCompliant: true,
    style: modernMinimalStyle,
    sections: [
      { id: 'personalInfo', title: 'Personal Information', required: true, order: 1 },
      { id: 'summary', title: 'Summary', required: false, order: 2 },
      { id: 'experience', title: 'Experience', required: true, order: 3, maxItems: 10 },
      { id: 'education', title: 'Education', required: true, order: 4, maxItems: 10 },
      { id: 'skills', title: 'Skills', required: true, order: 5 },
      { id: 'certifications', title: 'Certifications', required: false, order: 6 },
      { id: 'projects', title: 'Projects', required: false, order: 7 },
      { id: 'languages', title: 'Languages', required: false, order: 8 },
    ]
  },
  // Modern
  {
    id: 'modern-tech-purple',
    name: 'Tech Modern',
    description: 'Bold modern template with purple accents. Perfect for tech and innovative industries.',
    category: 'modern',
    atsCompliant: true,
    style: techModernStyle,
    sections: [
      { id: 'personalInfo', title: 'Personal Information', required: true, order: 1 },
      { id: 'summary', title: 'Professional Profile', required: false, order: 2 },
      { id: 'skills', title: 'Core Competencies', required: true, order: 3 },
      { id: 'experience', title: 'Work Experience', required: true, order: 4, maxItems: 10 },
      { id: 'education', title: 'Education', required: true, order: 5, maxItems: 10 },
      { id: 'projects', title: 'Key Projects', required: false, order: 6 },
      { id: 'certifications', title: 'Certifications', required: false, order: 7 },
    ]
  },
  // Creative
  {
    id: 'creative-bold-sidebar',
    name: 'Creative Bold',
    description: 'Bold creative template with high-contrast sidebar layout. Ideal for design-forward resumes.',
    category: 'creative',
    atsCompliant: true,
    style: creativeBoldStyle,
    sections: [
      { id: 'personalInfo', title: 'Personal Information', required: true, order: 1 },
      { id: 'summary', title: 'Creative Profile', required: false, order: 2 },
      { id: 'skills', title: 'Core Competencies', required: true, order: 3 },
      { id: 'experience', title: 'Experience', required: true, order: 4, maxItems: 10 },
      { id: 'education', title: 'Education', required: true, order: 5, maxItems: 10 },
      { id: 'projects', title: 'Key Projects', required: false, order: 6 },
      { id: 'certifications', title: 'Certifications', required: false, order: 7 },
      { id: 'languages', title: 'Languages', required: false, order: 8 },
    ]
  }
];

export function getTemplateById(id: string): TemplateMetadata | undefined {
  return TEMPLATES.find(t => t.id === id);
}

export function getTemplatesByCategory(category: TemplateMetadata['category']): TemplateMetadata[] {
  return TEMPLATES.filter(t => t.category === category);
}


