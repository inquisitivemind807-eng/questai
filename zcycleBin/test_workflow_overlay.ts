import { setupChromeDriver } from './src/bots/core/browser_manager';
import { UniversalOverlay } from './src/bots/core/universal_overlay';

async function testWorkflowOverlay() {
  console.log('🚀 Testing workflow overlay...');

  const { driver } = await setupChromeDriver('test');

  console.log('📱 Opening test page...');
  await driver.get('https://www.google.com');

  console.log('🎨 Creating overlay...');
  const overlay = new UniversalOverlay(driver);

  try {
    // Simulate workflow steps like the workflow engine does
    await overlay.showOverlay({
      title: '🤖 Bot Status: Starting',
      html: `
        <div style="line-height: 1.6;">
          <p style="font-size: 20px; margin: 10px 0;"><strong>Starting Workflow</strong></p>
          <p style="color: #00ff00;">Test workflow description</p>
        </div>
      `,
      draggable: true,
      collapsible: true
    });

    await driver.sleep(2000);

    // Step 1
    await overlay.updateOverlay({
      title: '🤖 Bot Status: Running',
      html: `
        <div style="line-height: 1.6;">
          <p style="font-size: 20px; margin: 10px 0;"><strong>Step 1: openHomepage</strong></p>
          <p style="color: #00ff00; font-size: 16px;">→ homepage_opened</p>
        </div>
      `
    });

    await driver.sleep(2000);

    // Step 2
    await overlay.updateOverlay({
      title: '🤖 Bot Status: Running',
      html: `
        <div style="line-height: 1.6;">
          <p style="font-size: 20px; margin: 10px 0;"><strong>Step 2: waitForPageLoad</strong></p>
          <p style="color: #00ff00; font-size: 16px;">→ page_loaded</p>
        </div>
      `
    });

    await driver.sleep(2000);

    // Completion
    await overlay.updateOverlay({
      title: '🤖 Bot Status: Completed',
      html: `
        <div style="line-height: 1.6;">
          <p style="font-size: 20px; margin: 10px 0;"><strong>Workflow Completed</strong></p>
          <p style="color: #00ff00; font-size: 16px;">✅ All steps finished successfully</p>
          <p style="color: #00ffff;">Total steps: 2</p>
        </div>
      `
    });

    console.log('✅ Workflow overlay test completed!');
    console.log('👀 Check the browser - you should see the dynamic workflow progress');
    console.log('Press Ctrl+C to exit');

    await driver.sleep(10000);

  } catch (error) {
    console.error('❌ Workflow overlay test failed:', error);
  }
}

testWorkflowOverlay().catch(console.error);