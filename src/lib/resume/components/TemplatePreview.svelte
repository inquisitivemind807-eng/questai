<script lang="ts">
  import type { TemplateMetadata } from '../types';
  
  interface Props {
    template: TemplateMetadata;
  }
  
  let { template }: Props = $props();
  
  // Layout helpers
  const layoutType = template.style.layoutType || 'single-column';
  const isTwoColumn =
    layoutType === 'two-column-split' || layoutType === 'two-column-sidebar';
  const leftColumnWidth = template.style.leftColumnWidth ?? 30;
  const rightColumnWidth = template.style.rightColumnWidth ?? 70;
  
  // Sample data for full resume preview
  const sampleData = {
    name: 'John Doe',
    title: 'Software Engineer',
    email: 'john.doe@email.com',
    phone: '+1 (555) 123-4567',
    linkedin: 'linkedin.com/in/johndoe',
    summary: 'Experienced Software Engineer with 5+ years of expertise in full-stack development, cloud architecture, and team leadership. Proven track record of delivering scalable applications.',
    experience: [
      {
        jobTitle: 'Senior Software Engineer',
        company: 'Tech Innovations Inc.',
        location: 'San Francisco, CA',
        period: 'Jan 2020 - Present',
        achievements: [
          'Led team of 5 engineers to develop SaaS platform serving 100K+ users',
          'Reduced application response time by 40% through optimization'
        ]
      },
      {
        jobTitle: 'Software Engineer',
        company: 'Digital Solutions Co.',
        location: 'New York, NY',
        period: 'Jun 2018 - Dec 2019',
        achievements: [
          'Developed RESTful APIs handling 1M+ requests per day',
          'Collaborated with cross-functional teams to deliver features'
        ]
      }
    ],
    education: [
      {
        degree: 'Bachelor of Science in Computer Science',
        institution: 'University of Technology',
        location: 'Boston, MA',
        year: '2018'
      }
    ],
    skills: ['JavaScript', 'React', 'Node.js', 'Python', 'AWS', 'Docker', 'Kubernetes', 'SQL'],
    certifications: [
      { name: 'AWS Certified Solutions Architect', issuer: 'Amazon Web Services', year: '2021' }
    ]
  };
</script>

<div class="template-preview" style:background-color={template.style.backgroundColor || '#ffffff'}>
  <!-- Header Preview -->
  <div class="preview-header" 
       style:color={template.style.primaryColor}
       style:font-family={template.style.headerFont}
       style:font-weight={template.style.headerFontWeight}
       style:text-align={template.style.headerAlignment}
       style:border-bottom={template.style.headerStyle === 'underline' ? `2px solid ${template.style.primaryColor}` : template.style.headerStyle === 'background' ? `2px solid ${template.style.secondaryColor}` : 'none'}
       style:padding-bottom={template.style.headerStyle !== 'plain' ? '12px' : '8px'}
       style:margin-bottom={template.style.sectionSpacing ? `${template.style.sectionSpacing / 20}px` : '12px'}>
    <div class="preview-name">{sampleData.name.toUpperCase()}</div>
    <div class="preview-title" 
         style:font-family={template.style.bodyFont}
         style:font-size="{template.style.bodyFontSize * 0.9}px"
         style:color={template.style.textColor}>
      {sampleData.title}
    </div>
    <div class="preview-contact"
         style:font-family={template.style.contactFont}
         style:font-size="{template.style.contactFontSize}px"
         style:color={template.style.textColor}>
      {sampleData.email} | {sampleData.phone} | {sampleData.linkedin}
    </div>
    {#if template.style.headerStyle === 'background' && template.style.showAccentBars}
      <div class="preview-accent-bar" style:background-color={template.style.secondaryColor}></div>
    {/if}
  </div>
  
  {#if isTwoColumn}
    <!-- Two-column layout preview -->
    <div class="preview-two-column">
      <!-- Left sidebar: contact + skills + certifications -->
      <div class="preview-column sidebar" style:width={`${leftColumnWidth}%`}>
        <!-- Sidebar contact block -->
        <div class="preview-section">
          <div class="preview-section-header"
               style:color={template.style.primaryColor}
               style:font-family={template.style.headerFont}
               style:font-weight={template.style.headerFontWeight}>
            CONTACT
          </div>
          <div class="preview-content"
               style:font-family={template.style.bodyFont}
               style:font-size="{template.style.bodyFontSize}px"
               style:color={template.style.textColor}>
            <div>{sampleData.email}</div>
            <div>{sampleData.phone}</div>
            <div>{sampleData.linkedin}</div>
          </div>
        </div>

        <!-- Skills in sidebar -->
        <div class="preview-section">
          <div class="preview-section-header"
               style:color={template.style.primaryColor}
               style:font-family={template.style.headerFont}
               style:font-weight={template.style.headerFontWeight}
               style:border-bottom={template.style.dividerStyle === 'line' || template.style.dividerStyle === 'dotted'
                 ? `1px ${template.style.dividerStyle === 'dotted' ? 'dotted' : 'solid'} ${template.style.dividerColor}`
                 : 'none'}>
            SKILLS
          </div>
          <div class="preview-skills"
               style:font-family={template.style.bodyFont}
               style:font-size="{template.style.bodyFontSize}px"
               style:color={template.style.textColor}>
            {sampleData.skills.join(' • ')}
          </div>
        </div>

        <!-- Certifications in sidebar -->
        <div class="preview-section">
          <div class="preview-section-header"
               style:color={template.style.primaryColor}
               style:font-family={template.style.headerFont}
               style:font-weight={template.style.headerFontWeight}
               style:border-bottom={template.style.dividerStyle === 'line' || template.style.dividerStyle === 'dotted'
                 ? `1px ${template.style.dividerStyle === 'dotted' ? 'dotted' : 'solid'} ${template.style.dividerColor}`
                 : 'none'}>
            CERTIFICATIONS
          </div>
          {#each sampleData.certifications as cert}
            <div class="preview-content"
                 style:font-family={template.style.bodyFont}
                 style:font-size="{template.style.bodyFontSize}px"
                 style:color={template.style.textColor}>
              <div>{cert.name} | {cert.issuer} | {cert.year}</div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Right main column: summary + experience + education -->
      <div class="preview-column main" style:width={`${rightColumnWidth}%`}>
        <!-- Summary Section -->
        <div class="preview-section">
          <div class="preview-section-header"
               style:color={template.style.primaryColor}
               style:font-family={template.style.headerFont}
               style:font-weight={template.style.headerFontWeight}
               style:border-bottom={template.style.dividerStyle === 'line' || template.style.dividerStyle === 'dotted'
                 ? `1px ${template.style.dividerStyle === 'dotted' ? 'dotted' : 'solid'} ${template.style.dividerColor}`
                 : 'none'}>
            SUMMARY
          </div>
          <div class="preview-content"
               style:font-family={template.style.bodyFont}
               style:font-size="{template.style.bodyFontSize}px"
               style:color={template.style.textColor}
               style:text-align={template.style.contentAlignment}>
            {sampleData.summary}
          </div>
        </div>

        <!-- Experience Section -->
        <div class="preview-section">
          <div class="preview-section-header"
               style:color={template.style.primaryColor}
               style:font-family={template.style.headerFont}
               style:font-weight={template.style.headerFontWeight}
               style:border-bottom={template.style.dividerStyle === 'line' || template.style.dividerStyle === 'dotted'
                 ? `1px ${template.style.dividerStyle === 'dotted' ? 'dotted' : 'solid'} ${template.style.dividerColor}`
                 : 'none'}>
            EXPERIENCE
          </div>
          {#each sampleData.experience as exp}
            <div class="preview-content"
                 style:font-family={template.style.bodyFont}
                 style:font-size="{template.style.bodyFontSize}px"
                 style:color={template.style.textColor}
                 style:margin-bottom="8px">
              <div class="preview-job-title">{exp.jobTitle} | {exp.company} | {exp.location} | {exp.period}</div>
              {#each exp.achievements as achievement}
                <div class="preview-bullet">• {achievement}</div>
              {/each}
            </div>
          {/each}
        </div>

        <!-- Education Section -->
        <div class="preview-section">
          <div class="preview-section-header"
               style:color={template.style.primaryColor}
               style:font-family={template.style.headerFont}
               style:font-weight={template.style.headerFontWeight}
               style:border-bottom={template.style.dividerStyle === 'line' || template.style.dividerStyle === 'dotted'
                 ? `1px ${template.style.dividerStyle === 'dotted' ? 'dotted' : 'solid'} ${template.style.dividerColor}`
                 : 'none'}>
            EDUCATION
          </div>
          {#each sampleData.education as edu}
            <div class="preview-content"
                 style:font-family={template.style.bodyFont}
                 style:font-size="{template.style.bodyFontSize}px"
                 style:color={template.style.textColor}>
              <div class="preview-job-title">{edu.degree} | {edu.institution} | {edu.location} | {edu.year}</div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {:else}
    <!-- Default single-column layout -->
    <!-- Summary Section -->
    <div class="preview-section">
      <div class="preview-section-header"
           style:color={template.style.primaryColor}
           style:font-family={template.style.headerFont}
           style:font-weight={template.style.headerFontWeight}
           style:border-bottom={template.style.dividerStyle === 'line' || template.style.dividerStyle === 'dotted'
             ? `1px ${template.style.dividerStyle === 'dotted' ? 'dotted' : 'solid'} ${template.style.dividerColor}`
             : 'none'}>
        SUMMARY
      </div>
      <div class="preview-content"
           style:font-family={template.style.bodyFont}
           style:font-size="{template.style.bodyFontSize}px"
           style:color={template.style.textColor}
           style:text-align={template.style.contentAlignment}>
        {sampleData.summary}
      </div>
    </div>

    <!-- Experience Section -->
    <div class="preview-section">
      <div class="preview-section-header"
           style:color={template.style.primaryColor}
           style:font-family={template.style.headerFont}
           style:font-weight={template.style.headerFontWeight}
           style:border-bottom={template.style.dividerStyle === 'line' || template.style.dividerStyle === 'dotted'
             ? `1px ${template.style.dividerStyle === 'dotted' ? 'dotted' : 'solid'} ${template.style.dividerColor}`
             : 'none'}>
        EXPERIENCE
      </div>
      {#each sampleData.experience as exp}
        <div class="preview-content"
             style:font-family={template.style.bodyFont}
             style:font-size="{template.style.bodyFontSize}px"
             style:color={template.style.textColor}
             style:margin-bottom="8px">
          <div class="preview-job-title">{exp.jobTitle} | {exp.company} | {exp.location} | {exp.period}</div>
          {#each exp.achievements as achievement}
            <div class="preview-bullet">• {achievement}</div>
          {/each}
        </div>
      {/each}
    </div>

    <!-- Education Section -->
    <div class="preview-section">
      <div class="preview-section-header"
           style:color={template.style.primaryColor}
           style:font-family={template.style.headerFont}
           style:font-weight={template.style.headerFontWeight}
           style:border-bottom={template.style.dividerStyle === 'line' || template.style.dividerStyle === 'dotted'
             ? `1px ${template.style.dividerStyle === 'dotted' ? 'dotted' : 'solid'} ${template.style.dividerColor}`
             : 'none'}>
        EDUCATION
      </div>
      {#each sampleData.education as edu}
        <div class="preview-content"
             style:font-family={template.style.bodyFont}
             style:font-size="{template.style.bodyFontSize}px"
             style:color={template.style.textColor}>
          <div class="preview-job-title">{edu.degree} | {edu.institution} | {edu.location} | {edu.year}</div>
        </div>
      {/each}
    </div>

    <!-- Skills Section -->
    <div class="preview-section">
      <div class="preview-section-header"
           style:color={template.style.primaryColor}
           style:font-family={template.style.headerFont}
           style:font-weight={template.style.headerFontWeight}
           style:border-bottom={template.style.dividerStyle === 'line' || template.style.dividerStyle === 'dotted'
             ? `1px ${template.style.dividerStyle === 'dotted' ? 'dotted' : 'solid'} ${template.style.dividerColor}`
             : 'none'}>
        SKILLS
      </div>
      <div class="preview-skills"
           style:font-family={template.style.bodyFont}
           style:font-size="{template.style.bodyFontSize}px"
           style:color={template.style.textColor}>
        {sampleData.skills.join(' • ')}
      </div>
    </div>

    <!-- Certifications Section -->
    <div class="preview-section">
      <div class="preview-section-header"
           style:color={template.style.primaryColor}
           style:font-family={template.style.headerFont}
           style:font-weight={template.style.headerFontWeight}
           style:border-bottom={template.style.dividerStyle === 'line' || template.style.dividerStyle === 'dotted'
             ? `1px ${template.style.dividerStyle === 'dotted' ? 'dotted' : 'solid'} ${template.style.dividerColor}`
             : 'none'}>
        CERTIFICATIONS
      </div>
      {#each sampleData.certifications as cert}
        <div class="preview-content"
             style:font-family={template.style.bodyFont}
             style:font-size="{template.style.bodyFontSize}px"
             style:color={template.style.textColor}>
          <div>{cert.name} | {cert.issuer} | {cert.year}</div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .template-preview {
    width: 100%;
    min-height: 600px;
    max-height: 800px;
    padding: 20px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: white;
    overflow-y: auto;
    font-size: 11px;
    line-height: 1.5;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transform: scale(0.5);
    transform-origin: top center;
    width: 200%;
    margin-left: -50%;
  }
  
  .preview-header {
    margin-bottom: 16px;
  }
  
  .preview-name {
    font-size: 22px;
    font-weight: bold;
    margin-bottom: 6px;
    letter-spacing: 0.5px;
    line-height: 1.2;
  }
  
  .preview-title {
    font-size: 14px;
    margin-bottom: 8px;
    font-style: italic;
    line-height: 1.3;
  }
  
  .preview-contact {
    font-size: 11px;
    margin-bottom: 8px;
    line-height: 1.4;
  }
  
  .preview-accent-bar {
    height: 4px;
    width: 100%;
    margin-top: 10px;
    border-radius: 2px;
  }
  
  .preview-section {
    margin-top: 16px;
    margin-bottom: 16px;
  }
  
  .preview-two-column {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }
  
  .preview-column {
    display: flex;
    flex-direction: column;
  }
  
  .preview-column.sidebar {
    border-right: 1px solid #e5e7eb;
    padding-right: 12px;
  }
  
  .preview-column.main {
    padding-left: 12px;
  }
  
  .preview-section-header {
    font-size: 13px;
    font-weight: bold;
    margin-bottom: 8px;
    padding-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    line-height: 1.4;
  }
  
  .preview-content {
    font-size: 11px;
    margin-top: 6px;
    line-height: 1.5;
  }
  
  .preview-job-title {
    font-weight: 600;
    margin-bottom: 4px;
    line-height: 1.4;
  }
  
  .preview-bullet {
    font-size: 11px;
    margin-left: 12px;
    margin-bottom: 3px;
    line-height: 1.5;
  }
  
  .preview-skills {
    font-size: 11px;
    margin-top: 6px;
    line-height: 1.5;
  }
  
  /* Scrollbar styling */
  .template-preview::-webkit-scrollbar {
    width: 6px;
  }
  
  .template-preview::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 3px;
  }
  
  .template-preview::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 3px;
  }
  
  .template-preview::-webkit-scrollbar-thumb:hover {
    background: #555;
  }
</style>

