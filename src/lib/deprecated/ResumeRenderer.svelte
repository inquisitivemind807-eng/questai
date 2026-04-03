<script lang="ts">
  import type { ResumeData, TemplateStyle } from '../types';
  import { getTemplateById } from '../templates';
  import { getEffectiveFont, getEffectiveFontSize, getLetterSpacing, getLineSpacing, getSectionSpacing } from '../utils/font-helpers';
  import { formatDateRange } from '../utils/date-formatter';
  import { getBulletCharacter, getBulletColor } from '../utils/bullet-styles';

  export let resume: ResumeData;
  export let editable: boolean = false;
  export let onFieldEdit: ((field: string) => void) | null = null;

  $: template = resume && resume.templateId ? getTemplateById(resume.templateId) : null;
  $: style = template?.style || getDefaultStyle();
  
  // Apply user font overrides
  $: effectiveStyle = resume ? {
    ...style,
    headerFont: getEffectiveFont(resume, style, 'header'),
    bodyFont: getEffectiveFont(resume, style, 'body'),
    contactFont: getEffectiveFont(resume, style, 'contact'),
    headerFontSize: getEffectiveFontSize(resume, style, 'header'),
    bodyFontSize: getEffectiveFontSize(resume, style, 'body'),
    contactFontSize: getEffectiveFontSize(resume, style, 'contact'),
    sectionSpacing: getSectionSpacing(resume, style),
  } : getDefaultStyle();

  // Determine layout type
  $: layoutType = effectiveStyle.layoutType || 'single-column';
  $: isMultiColumn = layoutType !== 'single-column';
  $: isTwoColumn = layoutType === 'two-column' || layoutType === 'two-column-sidebar' || layoutType === 'two-column-split' || layoutType === 'two-column-header';
  $: isThreeColumn = layoutType === 'three-column';
  $: contactPlacement = effectiveStyle.contactPlacement || 'header';
  $: showContactInHeader = contactPlacement === 'header' || contactPlacement === 'both';
  $: showContactInSidebar = contactPlacement === 'sidebar' || contactPlacement === 'both';

  // Organize sections for column layouts
  $: sidebarSections = effectiveStyle.sidebarSections || [];
  $: mainSections = effectiveStyle.mainSections || [];

  function getDefaultStyle(): TemplateStyle {
    return {
      primaryColor: '#000000',
      secondaryColor: '#666666',
      dividerColor: '#e5e7eb',
      textColor: '#000000',
      backgroundColor: '#ffffff',
      headerFont: 'Arial, sans-serif',
      bodyFont: 'Arial, sans-serif',
      contactFont: 'Arial, sans-serif',
      headerFontSize: 14,
      bodyFontSize: 11,
      contactFontSize: 10,
      headerFontWeight: 'bold',
      headerAlignment: 'center',
      contentAlignment: 'left',
      sectionSpacing: 240,
      headerStyle: 'plain',
      dividerStyle: 'line',
      showAccentBars: false,
    };
  }

  function getHeaderBorderStyle(): string {
    if (effectiveStyle.headerStyle === 'underline') {
      return `2px solid ${effectiveStyle.primaryColor}`;
    } else if (effectiveStyle.headerStyle === 'background') {
      return `2px solid ${effectiveStyle.secondaryColor}`;
    } else if (effectiveStyle.headerStyle === 'border') {
      return `1px solid ${effectiveStyle.primaryColor}`;
    }
    return 'none';
  }

  function getDividerStyle(): string {
    if (effectiveStyle.dividerStyle === 'line') {
      return `1px solid ${effectiveStyle.dividerColor}`;
    } else if (effectiveStyle.dividerStyle === 'dotted') {
      return `1px dotted ${effectiveStyle.dividerColor}`;
    } else if (effectiveStyle.dividerStyle === 'gradient') {
      return `linear-gradient(90deg, ${effectiveStyle.primaryColor} 0%, ${effectiveStyle.secondaryColor} 100%)`;
    }
    return 'none';
  }

  function getGradientBackground(): string {
    if (effectiveStyle.dividerStyle === 'gradient' && effectiveStyle.headerStyle === 'background') {
      return `linear-gradient(135deg, ${effectiveStyle.primaryColor} 0%, ${effectiveStyle.secondaryColor} 100%)`;
    }
    return 'none';
  }

  function getSectionMarginBottom(): string {
    return `${effectiveStyle.sectionSpacing / 20}px`;
  }

  function getTextAlign(alignment: string): string {
    return alignment === 'center' ? 'center' : alignment === 'right' ? 'right' : 'left';
  }

  function shouldShowInSidebar(sectionId: string): boolean {
    return sidebarSections.includes(sectionId);
  }

  function shouldShowInMain(sectionId: string): boolean {
    if (mainSections.length > 0) {
      return mainSections.includes(sectionId);
    }
    // If no mainSections specified, show all non-sidebar sections
    return !sidebarSections.includes(sectionId);
  }

  function hasSectionData(sectionId: string): boolean {
    // For sidebar-driven two-column layouts (e.g. Professional Split, Creative Bold),
    // always show Skills / Languages section headers in the sidebar so the left
    // column never looks completely empty, even before data is filled in.
    const wantsPersistentSidebarSection =
      (layoutType === 'two-column-split' || layoutType === 'two-column-sidebar') &&
      (sidebarSections || []).includes(sectionId) &&
      (sectionId === 'skills' || sectionId === 'languages');

    switch (sectionId) {
      case 'summary':
        return !!resume.summary;
      case 'experience':
        return resume.experience.length > 0;
      case 'education':
        return resume.education.length > 0;
      case 'skills':
        return wantsPersistentSidebarSection || resume.skills.length > 0;
      case 'certifications':
        return !!(resume.certifications && resume.certifications.length > 0);
      case 'projects':
        return !!(resume.projects && resume.projects.length > 0);
      case 'languages':
        return wantsPersistentSidebarSection || !!(resume.languages && resume.languages.length > 0);
      default:
        return false;
    }
  }

  function getCardClass(): string {
    if (layoutType === 'three-column' && effectiveStyle.backgroundColor !== '#ffffff') {
      return 'card-layout';
    }
    return '';
  }
</script>

{#if resume}
<div 
  class="resume-container {getCardClass()}"
  class:multi-column={isMultiColumn}
  class:two-column={isTwoColumn}
  class:three-column={isThreeColumn}
  style:background-color={effectiveStyle.backgroundColor || '#ffffff'}
  style:font-family={effectiveStyle.bodyFont}
  style:font-size="{effectiveStyle.bodyFontSize}px"
  style:color={effectiveStyle.textColor}
  style:line-height={getLineSpacing(resume)}
  style:letter-spacing={getLetterSpacing(resume)}>
  
  <!-- Header Section -->
  <div 
    class="resume-header"
    class:gradient-header={effectiveStyle.headerStyle === 'background' && effectiveStyle.dividerStyle === 'gradient'}
    style:text-align={getTextAlign(effectiveStyle.headerAlignment)}
    style:border-bottom={getHeaderBorderStyle()}
    style:background={getGradientBackground()}
    style:padding={effectiveStyle.headerStyle === 'background' ? '24px' : '0'}
    style:padding-bottom={effectiveStyle.headerStyle !== 'plain' ? '12px' : '8px'}
    style:margin-bottom={getSectionMarginBottom()}
    style:border-radius={effectiveStyle.headerStyle === 'background' ? '8px' : '0'}>
    
    <h1 
      class="resume-name"
      style:color={effectiveStyle.headerStyle === 'background' && effectiveStyle.dividerStyle === 'gradient' ? '#ffffff' : effectiveStyle.primaryColor}
      style:font-family={effectiveStyle.headerFont}
      style:font-size="{getEffectiveFontSize(resume, effectiveStyle, 'name')}px"
      style:font-weight={effectiveStyle.headerFontWeight}>
      {resume.personalInfo.fullName || 'Your Full Name'}
    </h1>
    
    <h2 
      class="resume-title"
      style:color={effectiveStyle.headerStyle === 'background' && effectiveStyle.dividerStyle === 'gradient' ? '#f0f0f0' : effectiveStyle.textColor}
      style:font-family={effectiveStyle.bodyFont}
      style:font-size="{effectiveStyle.bodyFontSize * 0.9}px"
      style:font-style="italic">
      {resume.personalInfo.title || 'Your Job Title'}
    </h2>
    
    {#if showContactInHeader}
    <div 
      class="resume-contact"
      style:font-family={effectiveStyle.contactFont}
      style:font-size="{effectiveStyle.contactFontSize}px"
        style:color={effectiveStyle.headerStyle === 'background' && effectiveStyle.dividerStyle === 'gradient' ? '#f0f0f0' : effectiveStyle.textColor}
      style:justify-content={effectiveStyle.headerAlignment === 'center' ? 'center' : effectiveStyle.headerAlignment === 'right' ? 'flex-end' : 'flex-start'}>
      {resume.personalInfo.email || 'email@example.com'}
      {#if resume.personalInfo.phone}
          <span style:color={effectiveStyle.headerStyle === 'background' && effectiveStyle.dividerStyle === 'gradient' ? 'rgba(255,255,255,0.7)' : effectiveStyle.dividerColor}>|</span>
        {resume.personalInfo.phone}
      {/if}
      {#if resume.personalInfo.linkedin}
          <span style:color={effectiveStyle.headerStyle === 'background' && effectiveStyle.dividerStyle === 'gradient' ? 'rgba(255,255,255,0.7)' : effectiveStyle.dividerColor}>|</span>
        LinkedIn: {resume.personalInfo.linkedin}
      {/if}
      {#if resume.personalInfo.github}
          <span style:color={effectiveStyle.headerStyle === 'background' && effectiveStyle.dividerStyle === 'gradient' ? 'rgba(255,255,255,0.7)' : effectiveStyle.dividerColor}>|</span>
        GitHub: {resume.personalInfo.github}
      {/if}
      {#if resume.personalInfo.website}
          <span style:color={effectiveStyle.headerStyle === 'background' && effectiveStyle.dividerStyle === 'gradient' ? 'rgba(255,255,255,0.7)' : effectiveStyle.dividerColor}>|</span>
        {resume.personalInfo.website}
      {/if}
    </div>
    {/if}
    
    {#if effectiveStyle.headerStyle === 'background' && effectiveStyle.showAccentBars}
      <div 
        class="accent-bar"
        style:background={effectiveStyle.dividerStyle === 'gradient' ? `linear-gradient(90deg, ${effectiveStyle.secondaryColor} 0%, ${effectiveStyle.primaryColor} 100%)` : effectiveStyle.secondaryColor}></div>
    {/if}
  </div>

  {#if isMultiColumn}
    <!-- Multi-Column Layout -->
    {#if isTwoColumn}
      <div class="two-column-wrapper">
        <!-- Sidebar Column (Skills / Languages / Certifications / Education) - always rendered first so it sits at the very top/left -->
        {#if layoutType === 'two-column-sidebar' || layoutType === 'two-column-split'}
          <div 
            class="column sidebar-column"
            class:split-column={layoutType === 'two-column-split'}
            style:width="{effectiveStyle.leftColumnWidth || 30}%"
            style:flex-basis="{effectiveStyle.leftColumnWidth || 30}%"
            style:background-color={layoutType === 'two-column-sidebar' ? effectiveStyle.backgroundColor || '#f8f9fa' : 'transparent'}
            style:padding-right={layoutType === 'two-column-sidebar' ? '20px' : '16px'}>
            
            <!-- Ensure Skills / Languages appear at the very top of the sidebar -->
            {#if shouldShowInSidebar('skills') && hasSectionData('skills')}
              {@render SectionSkills()}
            {/if}
            
            {#if shouldShowInSidebar('languages') && hasSectionData('languages')}
              {@render SectionLanguages()}
            {/if}
            
            {#if shouldShowInSidebar('certifications') && hasSectionData('certifications')}
              {@render SectionCertifications()}
            {/if}
            
            {#if shouldShowInSidebar('education') && hasSectionData('education')}
              {@render SectionEducation()}
            {/if}

            {#if showContactInSidebar}
              <div 
                class="sidebar-contact"
                style:font-family={effectiveStyle.contactFont}
                style:font-size="{effectiveStyle.contactFontSize}px"
                style:color={effectiveStyle.textColor}>
                {#if resume.personalInfo.email}
                  <div class="contact-item">{resume.personalInfo.email}</div>
                {/if}
                {#if resume.personalInfo.phone}
                  <div class="contact-item">{resume.personalInfo.phone}</div>
                {/if}
                {#if resume.personalInfo.linkedin}
                  <div class="contact-item">LinkedIn: {resume.personalInfo.linkedin}</div>
                {/if}
                {#if resume.personalInfo.github}
                  <div class="contact-item">GitHub: {resume.personalInfo.github}</div>
                {/if}
                {#if resume.personalInfo.website}
                  <div class="contact-item">{resume.personalInfo.website}</div>
                {/if}
                {#if resume.personalInfo.address}
                  <div class="contact-item">{resume.personalInfo.address}</div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Main Content Column -->
        <div 
          class="column main-column"
          class:split-column={layoutType === 'two-column-split'}
          style:width={layoutType === 'two-column-sidebar' || layoutType === 'two-column-split' ? `${effectiveStyle.rightColumnWidth || 70}%` : '50%'}
          style:flex-basis={layoutType === 'two-column-sidebar' || layoutType === 'two-column-split' ? `${effectiveStyle.rightColumnWidth || 70}%` : '50%'}
          style:padding-left={layoutType === 'two-column-sidebar' || layoutType === 'two-column-split' ? '20px' : '16px'}>
          
          {#if shouldShowInMain('summary') && hasSectionData('summary')}
            {@render SectionSummary()}
          {/if}
          
          {#if shouldShowInMain('experience') && hasSectionData('experience')}
            {@render SectionExperience()}
          {/if}
          
          {#if shouldShowInMain('education') && hasSectionData('education') && !shouldShowInSidebar('education')}
            {@render SectionEducation()}
          {/if}
          
          {#if shouldShowInMain('projects') && hasSectionData('projects')}
            {@render SectionProjects()}
          {/if}
          
          {#if shouldShowInMain('certifications') && hasSectionData('certifications') && !shouldShowInSidebar('certifications')}
            {@render SectionCertifications()}
          {/if}
          
          {#if shouldShowInMain('skills') && hasSectionData('skills') && !shouldShowInSidebar('skills')}
            {@render SectionSkills()}
          {/if}
          
          {#if shouldShowInMain('languages') && hasSectionData('languages') && !shouldShowInSidebar('languages')}
            {@render SectionLanguages()}
          {/if}
        </div>
      </div>
    {:else if isThreeColumn}
      <!-- Three-Column Layout -->
      <!-- DOM order prioritized for ATS: middle (Summary/Experience) first -->
      <div class="three-column-wrapper">
        <!-- Middle Column (Summary, Experience) -->
        <div 
          class="column middle-column"
          style:width="{effectiveStyle.middleColumnWidth || 50}%"
          style:padding-left="16px"
          style:padding-right="16px">
          
          {#if hasSectionData('summary')}
            {@render SectionSummary()}
          {/if}
          
          {#if hasSectionData('experience')}
            {@render SectionExperience()}
          {/if}
        </div>

        <!-- Left Column (Skills / Languages) -->
        <div 
          class="column left-column"
          style:width="{effectiveStyle.leftColumnWidth || 25}%"
          style:padding-right="16px">
          
          {#if hasSectionData('skills')}
            {@render SectionSkills()}
          {/if}
          
          {#if hasSectionData('languages')}
            {@render SectionLanguages()}
          {/if}
        </div>

        <!-- Right Column (Education / Certifications / Projects) -->
        <div 
          class="column right-column"
          style:width="{effectiveStyle.rightColumnWidth || 25}%"
          style:padding-left="16px">
          
          {#if hasSectionData('education')}
            {@render SectionEducation()}
          {/if}
          
          {#if hasSectionData('certifications')}
            {@render SectionCertifications()}
          {/if}
          
          {#if hasSectionData('projects')}
            {@render SectionProjects()}
          {/if}
        </div>
      </div>
    {/if}
  {:else}
    <!-- Single-Column Layout -->
    {#if hasSectionData('summary')}
      {@render SectionSummary()}
    {/if}
    
    {#if hasSectionData('experience')}
      {@render SectionExperience()}
    {/if}
    
    {#if hasSectionData('education')}
      {@render SectionEducation()}
    {/if}
    
    {#if hasSectionData('skills')}
      {@render SectionSkills()}
    {/if}
    
    {#if hasSectionData('certifications')}
      {@render SectionCertifications()}
    {/if}
    
    {#if hasSectionData('projects')}
      {@render SectionProjects()}
    {/if}
    
    {#if hasSectionData('languages')}
      {@render SectionLanguages()}
    {/if}
  {/if}
</div>
{/if}

<!-- Section Components -->
{#snippet SectionSummary()}
  <div class="resume-section {layoutType === 'three-column' ? 'card-section' : ''}" style:margin-bottom={getSectionMarginBottom()}>
      <h3 
        class="section-header"
        style:color={effectiveStyle.primaryColor}
        style:font-family={effectiveStyle.headerFont}
        style:font-size="{effectiveStyle.headerFontSize}px"
        style:font-weight={effectiveStyle.headerFontWeight}
        style:border-bottom={getDividerStyle()}
        style:padding-bottom={effectiveStyle.dividerStyle !== 'none' ? '4px' : '0'}
        style:text-transform="uppercase"
        style:letter-spacing="0.5px">
        Summary
      </h3>
      <p 
        class="section-content"
        style:font-family={effectiveStyle.bodyFont}
        style:font-size="{effectiveStyle.bodyFontSize}px"
        style:color={effectiveStyle.textColor}>
        {resume.summary}
      </p>
    </div>
{/snippet}

{#snippet SectionExperience()}
  <div class="resume-section {layoutType === 'three-column' ? 'card-section' : ''}" style:margin-bottom={getSectionMarginBottom()}>
      <h3 
        class="section-header"
        style:color={effectiveStyle.primaryColor}
        style:font-family={effectiveStyle.headerFont}
        style:font-size="{effectiveStyle.headerFontSize}px"
        style:font-weight={effectiveStyle.headerFontWeight}
        style:border-bottom={getDividerStyle()}
        style:padding-bottom={effectiveStyle.dividerStyle !== 'none' ? '4px' : '0'}
        style:text-transform="uppercase"
        style:letter-spacing="0.5px">
        Experience
      </h3>
      
      {#each resume.experience as exp}
      <div 
        class="experience-item {layoutType === 'three-column' ? 'card-item' : ''}" 
        style:margin-bottom="12px"
        style:border-left-color={layoutType === 'three-column' ? effectiveStyle.secondaryColor : 'transparent'}>
          <div class="experience-header">
            <h4 
              class="job-title"
              style:font-family={effectiveStyle.bodyFont}
              style:font-size="{effectiveStyle.bodyFontSize * 1.1}px"
              style:font-weight="bold"
              style:color={effectiveStyle.textColor}>
              {exp.jobTitle}
            </h4>
            <span 
              class="company-name"
              style:font-family={effectiveStyle.bodyFont}
              style:font-size="{effectiveStyle.bodyFontSize}px"
              style:color={effectiveStyle.textColor}>
              {exp.company}
            </span>
            {#if exp.location}
              <span 
                class="location"
                style:color={effectiveStyle.dividerColor}>|</span>
              <span 
                style:font-family={effectiveStyle.bodyFont}
                style:font-size="{effectiveStyle.bodyFontSize}px"
                style:color={effectiveStyle.textColor}>
                {exp.location}
              </span>
            {/if}
          </div>
          
          <div 
            class="date-range"
            style:font-family={effectiveStyle.bodyFont}
            style:font-size="{effectiveStyle.bodyFontSize * 0.9}px"
            style:color={effectiveStyle.textColor}
            style:font-style="italic">
            {formatDateRange(exp.startDate, exp.endDate || null, effectiveStyle)}
          </div>
          
          {#if exp.achievements && exp.achievements.length > 0}
            <ul class="achievements-list">
              {#each exp.achievements as achievement}
                <li 
                  class="achievement-item"
                  style:font-family={effectiveStyle.bodyFont}
                  style:font-size="{effectiveStyle.bodyFontSize}px"
                  style:color={effectiveStyle.textColor}
                  style:list-style-type="none"
                  style:margin-left="20px"
                  style:margin-bottom="4px">
                  <span 
                    style:color={getBulletColor(effectiveStyle) || effectiveStyle.textColor}
                    style:margin-right="8px">
                    {getBulletCharacter(effectiveStyle)}
                  </span>
                  {achievement}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/each}
    </div>
{/snippet}

{#snippet SectionEducation()}
  <div class="resume-section {layoutType === 'three-column' ? 'card-section' : ''}" style:margin-bottom={getSectionMarginBottom()}>
      <h3 
        class="section-header"
        style:color={effectiveStyle.primaryColor}
        style:font-family={effectiveStyle.headerFont}
        style:font-size="{effectiveStyle.headerFontSize}px"
        style:font-weight={effectiveStyle.headerFontWeight}
        style:border-bottom={getDividerStyle()}
        style:padding-bottom={effectiveStyle.dividerStyle !== 'none' ? '4px' : '0'}
        style:text-transform="uppercase"
        style:letter-spacing="0.5px">
        Education
      </h3>
      
      {#each resume.education as edu}
      <div 
        class="education-item {layoutType === 'three-column' ? 'card-item' : ''}" 
        style:margin-bottom="12px"
        style:border-left-color={layoutType === 'three-column' ? effectiveStyle.secondaryColor : 'transparent'}>
          <h4 
            class="degree"
            style:font-family={effectiveStyle.bodyFont}
            style:font-size="{effectiveStyle.bodyFontSize * 1.1}px"
            style:font-weight="bold"
            style:color={effectiveStyle.textColor}>
            {edu.degree}
          </h4>
          <span 
            class="institution"
            style:font-family={effectiveStyle.bodyFont}
            style:font-size="{effectiveStyle.bodyFontSize}px"
            style:color={effectiveStyle.textColor}>
            {edu.institution}
          </span>
          {#if edu.location}
            <span 
              style:color={effectiveStyle.dividerColor}>|</span>
            <span 
              style:font-family={effectiveStyle.bodyFont}
              style:font-size="{effectiveStyle.bodyFontSize}px"
              style:color={effectiveStyle.textColor}>
              {edu.location}
            </span>
          {/if}
          {#if edu.graduationDate}
            <div 
              class="graduation-date"
              style:font-family={effectiveStyle.bodyFont}
              style:font-size="{effectiveStyle.bodyFontSize * 0.9}px"
              style:color={effectiveStyle.textColor}
              style:font-style="italic">
              {edu.graduationDate}
            </div>
          {/if}
          {#if edu.gpa}
            <span 
              style:color={effectiveStyle.dividerColor}>|</span>
            <span 
              style:font-family={effectiveStyle.bodyFont}
              style:font-size="{effectiveStyle.bodyFontSize}px"
              style:color={effectiveStyle.textColor}>
              GPA: {edu.gpa}
            </span>
          {/if}
        </div>
      {/each}
    </div>
{/snippet}

{#snippet SectionSkills()}
  <div class="resume-section {layoutType === 'three-column' ? 'card-section' : ''}" style:margin-bottom={getSectionMarginBottom()}>
      <h3 
        class="section-header"
        style:color={effectiveStyle.primaryColor}
        style:font-family={effectiveStyle.headerFont}
        style:font-size="{effectiveStyle.headerFontSize}px"
        style:font-weight={effectiveStyle.headerFontWeight}
        style:border-bottom={getDividerStyle()}
        style:padding-bottom={effectiveStyle.dividerStyle !== 'none' ? '4px' : '0'}
        style:text-transform="uppercase"
        style:letter-spacing="0.5px">
        Skills
      </h3>
      
    <div class="skills-content {isMultiColumn ? 'skills-column' : ''}">
        {#each resume.skills as skill}
          <span 
          class="skill-item {layoutType === 'three-column' ? 'skill-chip' : ''}"
            style:font-family={effectiveStyle.bodyFont}
            style:font-size="{effectiveStyle.bodyFontSize}px"
            style:color={effectiveStyle.textColor}>
            {skill.name}
            {#if skill.category}
              <span style:color={effectiveStyle.dividerColor}> • </span>
              <span style:font-style="italic">{skill.category}</span>
            {/if}
          </span>
        {/each}
      </div>
    </div>
{/snippet}

{#snippet SectionCertifications()}
  <div class="resume-section {layoutType === 'three-column' ? 'card-section' : ''}" style:margin-bottom={getSectionMarginBottom()}>
      <h3 
        class="section-header"
        style:color={effectiveStyle.primaryColor}
        style:font-family={effectiveStyle.headerFont}
        style:font-size="{effectiveStyle.headerFontSize}px"
        style:font-weight={effectiveStyle.headerFontWeight}
        style:border-bottom={getDividerStyle()}
        style:padding-bottom={effectiveStyle.dividerStyle !== 'none' ? '4px' : '0'}
        style:text-transform="uppercase"
        style:letter-spacing="0.5px">
        Certifications
      </h3>
      
      {#each resume.certifications as cert}
      <div 
        class="certification-item {layoutType === 'three-column' ? 'card-item' : ''}" 
        style:margin-bottom="8px"
        style:border-left-color={layoutType === 'three-column' ? effectiveStyle.secondaryColor : 'transparent'}>
          <span 
            style:font-family={effectiveStyle.bodyFont}
            style:font-size="{effectiveStyle.bodyFontSize}px"
            style:color={effectiveStyle.textColor}
            style:font-weight="bold">
            {cert.name}
          </span>
          {#if cert.issuer}
            <span style:color={effectiveStyle.dividerColor}> • </span>
            <span 
              style:font-family={effectiveStyle.bodyFont}
              style:font-size="{effectiveStyle.bodyFontSize}px"
              style:color={effectiveStyle.textColor}>
              {cert.issuer}
            </span>
          {/if}
          {#if cert.date}
            <span style:color={effectiveStyle.dividerColor}> • </span>
            <span 
              style:font-family={effectiveStyle.bodyFont}
              style:font-size="{effectiveStyle.bodyFontSize}px"
              style:color={effectiveStyle.textColor}>
              {cert.date}
            </span>
          {/if}
        </div>
      {/each}
    </div>
{/snippet}

{#snippet SectionProjects()}
  <div class="resume-section {layoutType === 'three-column' ? 'card-section' : ''}" style:margin-bottom={getSectionMarginBottom()}>
      <h3 
        class="section-header"
        style:color={effectiveStyle.primaryColor}
        style:font-family={effectiveStyle.headerFont}
        style:font-size="{effectiveStyle.headerFontSize}px"
        style:font-weight={effectiveStyle.headerFontWeight}
        style:border-bottom={getDividerStyle()}
        style:padding-bottom={effectiveStyle.dividerStyle !== 'none' ? '4px' : '0'}
        style:text-transform="uppercase"
        style:letter-spacing="0.5px">
        Projects
      </h3>
      
      {#each resume.projects as project}
      <div 
        class="project-item {layoutType === 'three-column' ? 'card-item' : ''}" 
        style:margin-bottom="12px"
        style:border-left-color={layoutType === 'three-column' ? effectiveStyle.secondaryColor : 'transparent'}>
          <h4 
            class="project-title"
            style:font-family={effectiveStyle.bodyFont}
            style:font-size="{effectiveStyle.bodyFontSize * 1.1}px"
            style:font-weight="bold"
            style:color={effectiveStyle.textColor}>
            {project.title}
          </h4>
          {#if project.role || project.organization}
            <div 
              style:font-family={effectiveStyle.bodyFont}
              style:font-size="{effectiveStyle.bodyFontSize}px"
              style:color={effectiveStyle.textColor}>
              {project.role}
              {#if project.organization}
                <span style:color={effectiveStyle.dividerColor}> • </span>
                {project.organization}
              {/if}
            </div>
          {/if}
          {#if project.description && project.description.length > 0}
            <ul class="project-description">
              {#each project.description as desc}
                <li 
                  style:font-family={effectiveStyle.bodyFont}
                  style:font-size="{effectiveStyle.bodyFontSize}px"
                  style:color={effectiveStyle.textColor}
                  style:list-style-type="none"
                  style:margin-left="20px"
                  style:margin-bottom="4px">
                  <span 
                    style:color={getBulletColor(effectiveStyle) || effectiveStyle.textColor}
                    style:margin-right="8px">
                    {getBulletCharacter(effectiveStyle)}
                  </span>
                  {desc}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/each}
    </div>
{/snippet}

{#snippet SectionLanguages()}
  <div class="resume-section {layoutType === 'three-column' ? 'card-section' : ''}" style:margin-bottom={getSectionMarginBottom()}>
      <h3 
        class="section-header"
        style:color={effectiveStyle.primaryColor}
        style:font-family={effectiveStyle.headerFont}
        style:font-size="{effectiveStyle.headerFontSize}px"
        style:font-weight={effectiveStyle.headerFontWeight}
        style:border-bottom={getDividerStyle()}
        style:padding-bottom={effectiveStyle.dividerStyle !== 'none' ? '4px' : '0'}
        style:text-transform="uppercase"
        style:letter-spacing="0.5px">
        Languages
      </h3>
      
    <div class="languages-content {isMultiColumn ? 'languages-column' : ''}">
        {#each resume.languages as language}
          <span 
          class="language-item {layoutType === 'three-column' ? 'language-chip' : ''}"
            style:font-family={effectiveStyle.bodyFont}
            style:font-size="{effectiveStyle.bodyFontSize}px"
            style:color={effectiveStyle.textColor}>
            {language.name}
            {#if language.proficiency}
              <span style:color={effectiveStyle.dividerColor}> • </span>
              <span style:font-style="italic">{language.proficiency}</span>
            {/if}
          </span>
        {/each}
      </div>
    </div>
{/snippet}

<style>
  .resume-container {
    width: 100%;
    max-width: 8.5in;
    margin: 0 auto;
    padding: 48px;
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;
  }

  .resume-container.card-layout {
    background: #f8fafc;
    padding: 32px;
  }

  .resume-container.multi-column {
    padding: 40px;
  }

  .resume-header {
    margin-bottom: 24px;
    position: relative;
  }

  .resume-header.gradient-header {
    color: white;
    margin-bottom: 32px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .resume-name {
    margin-bottom: 8px;
    line-height: 1.2;
  }

  .resume-title {
    margin-bottom: 12px;
    line-height: 1.3;
  }

  .resume-contact {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    font-size: 10px;
    line-height: 1.4;
  }

  .accent-bar {
    height: 4px;
    width: 100%;
    margin-top: 10px;
    border-radius: 2px;
  }

  .resume-section {
    margin-bottom: 20px;
  }

  .card-section {
    background: white;
    padding: 16px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
    margin-bottom: 16px;
  }

  .card-item {
    padding: 8px;
    border-left: 3px solid;
    padding-left: 12px;
    transition: all 0.2s ease;
  }

  .card-item:hover {
    background: rgba(59, 130, 246, 0.05);
  }

  .section-header {
    margin-bottom: 12px;
    line-height: 1.4;
    position: relative;
  }

  .section-content {
    line-height: 1.6;
    margin-top: 8px;
  }

  /* Multi-Column Layouts */
  .two-column-wrapper,
  .three-column-wrapper {
    display: flex;
    flex-wrap: nowrap;
    gap: 24px;
    align-items: flex-start;
  }

  .two-column-wrapper {
    flex-direction: row;
  }

  .three-column-wrapper {
    flex-direction: row;
  }

  .column {
    display: flex;
    flex-direction: column;
  }

  .sidebar-column {
    border-right: 2px solid #e5e7eb;
    padding-right: 20px;
    order: 1; /* visually left in desktop, though main column is first in DOM for ATS */
    justify-content: flex-start; /* ensure sidebar content (Skills/Languages/etc.) is pinned to the top */
  }

  .sidebar-contact {
    margin-bottom: 24px;
    padding-bottom: 20px;
    border-bottom: 1px solid #e5e7eb;
  }

  .contact-item {
    word-break: break-word;
    line-height: 1.5;
    margin-bottom: 8px;
  }

  .main-column {
    flex: 1;
    order: 2;
  }

  .main-column.split-column {
    flex: 0 0 auto;
  }

  .split-column {
    flex-shrink: 0;
    min-width: 0;
  }

  .left-column,
  .middle-column,
  .right-column {
    display: flex;
    flex-direction: column;
  }

  /* Three-column visual order: left, middle, right, while DOM can be middle-first for ATS */
  .left-column {
    order: 1;
  }

  .middle-column {
    order: 2;
    flex: 1;
  }

  .right-column {
    order: 3;
  }

  /* Experience, Education, Projects */
  .experience-item,
  .education-item,
  .project-item {
    margin-bottom: 16px;
  }

  .experience-header,
  .job-title,
  .company-name {
    display: inline-block;
    margin-right: 8px;
  }

  .date-range {
    margin-top: 4px;
    margin-bottom: 8px;
  }

  .achievements-list,
  .project-description {
    margin-top: 8px;
    padding-left: 0;
  }

  .achievement-item,
  .project-description li {
    line-height: 1.5;
  }

  /* Skills & Languages */
  .skills-content,
  .languages-content {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 8px;
  }

  .skills-content.skills-column,
  .languages-content.languages-column {
    flex-direction: column;
    gap: 8px;
  }

  .skill-item,
  .language-item {
    display: inline-block;
  }

  .skill-chip,
  .language-chip {
    display: inline-block;
    padding: 4px 12px;
    background: rgba(59, 130, 246, 0.1);
    border-radius: 12px;
    border: 1px solid rgba(59, 130, 246, 0.2);
  }

  .certification-item {
    line-height: 1.5;
  }

  /* Responsive adjustments */
  @media print {
    .resume-container {
      box-shadow: none;
      padding: 0;
    }
    
    .two-column-wrapper,
    .three-column-wrapper {
      gap: 16px;
    }
  }

  @media (max-width: 768px) {
    .two-column-wrapper,
    .three-column-wrapper {
      flex-direction: column;
    }
    
    .column {
      width: 100% !important;
      padding: 0 !important;
    }
    
    .sidebar-column {
      border-right: none;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 20px;
      margin-bottom: 20px;
    }

    .sidebar-contact {
      margin-bottom: 20px;
      padding-bottom: 16px;
    }
  }
</style>
