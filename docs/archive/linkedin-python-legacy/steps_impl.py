from __future__ import annotations
import asyncio
import json
import os
from typing import Any, Dict, AsyncGenerator

from helpers.config_manager import load_settings

SELECTORS: Dict[str, Any] = {}

def _load_selectors_from_json(base_dir: str | None = None) -> Dict[str, Any]:
	"""
	Load LinkedIn selectors JSON from common candidate locations.
	"""
	here = os.path.dirname(__file__)
	candidates = []
	candidates.append(os.path.join(here, "linkedin_selectors.json"))
	candidates.append(os.path.join(os.getcwd(), "guu/workflows/linkedin/linkedin_selectors.json"))
	candidates.append("guu/workflows/linkedin/linkedin_selectors.json")
	for p in candidates:
		try:
			with open(p, "r", encoding="utf-8") as f:
				return json.load(f)
		except Exception:
			continue
	return {}

# Ensure Selectors are Loaded
async def ensure_selectors(ctx: Dict[str, Any]) -> Dict[str, Any]:
	"""
	Ensure global SELECTORS is populated from JSON once.
	"""
	global SELECTORS
	if SELECTORS:
		return SELECTORS
	base_dir_val = ctx.get("base_dir")
	base_dir = str(base_dir_val) if isinstance(base_dir_val, (str, os.PathLike)) else "."
	SELECTORS = _load_selectors_from_json(base_dir)
	return SELECTORS


# Helper function to scroll to a target element
async def scroll_to_view(page, target, top: bool = False, smooth: bool = False) -> None:
	try:
		loc = page.locator(target) if isinstance(target, str) else target
		if await loc.count() == 0:
			return
		handle = await loc.first.element_handle()
		if not handle:
			return
		block = "start" if top else "center"
		behavior = "smooth" if smooth else "auto"
		await page.evaluate("(el, b, beh) => el.scrollIntoView({block: b, behavior: beh})", handle, block, behavior)
	except Exception:
		pass


# Open and Check Login
async def open_check_login(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
	print("LinkedIn Step0: open and check login")
	context = ctx["browser_context"]
	await ensure_selectors(ctx)
	try:
		# Use an existing non-UI page if available
		page = ctx.get("page")
		if page is None:
			for p in context.pages:
				if "127.0.0.1:6666" not in (p.url or ""):
					page = p
					break
		if page is None:
			print("[linkedin.step0] No available page to use; waiting")
			yield "no_page_available"
			return
		await page.goto(SELECTORS.get("home_url", "https://www.linkedin.com/"), wait_until="domcontentloaded")
		ctx["page"] = page
		yield "home page loaded"
	except Exception as e:
		print(f"[linkedin.step0] navigation error: {e}")
		yield "failed to navigate"
		return
	
	try:
		# Check if already on feed (logged in)
		if page.url.startswith(SELECTORS["feed_url"]):
			yield "login not needed"
			return
			
		# Check for sign-in indicators
		signin_indicators = [
			await page.locator(f'text="{SELECTORS["signin_link_text"]}"').count(),
			await page.locator(f"xpath={SELECTORS['signin_button_xpath']}").count(),
			await page.locator(f'text="{SELECTORS["join_now_link_text"]}"').count()
		]
		
		if any(count > 0 for count in signin_indicators):
			yield "user needs to log in"
		else:
			print("No sign-in indicators found, assuming logged in")
			yield "cannot determine login status"
			
	except Exception as e:
		print(f"[linkedin.step0] login check error: {e}")
		yield "failed checking login status"


# Attempt Credential Login
async def credential_login(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
	print("LinkedIn Step1: attempt credential login")
	context = ctx["browser_context"]
	page = ctx.get("page")
	await ensure_selectors(ctx)

	if page is None:
		# Try reuse any non-UI page
		for p in context.pages:
			if "127.0.0.1:6666" not in (p.url or ""):
				page = p
				break
	if page is None:
		print("[linkedin.step1] No page available; waiting")
		yield "no available page"
		return

	settings = load_settings(str(ctx.get("base_dir", ".")), "linkedin")
	secrets = settings.get("secrets", {})
	username = ((secrets.get("username") or {}).get("value") or "").strip()
	password = ((secrets.get("password") or {}).get("value") or "").strip()

	if not username or not password:
		print("[linkedin.step1] Missing credentials in config; require manual login")
		yield "no login credentials found"
		return

	try:
		await page.goto(SELECTORS.get("login_url", "https://www.linkedin.com/login"), wait_until="domcontentloaded")
		yield "login page loaded successfully"
		
		try:
			await page.fill(f"#{SELECTORS['username_input_id']}", username)
			yield "username filled successfully"
		except Exception:
			print("[linkedin.step1] username input not found")
			yield "username_input_not_found"
			return
			
		try:
			await page.fill(f"#{SELECTORS['password_input_id']}", password)
			yield "password filled successfully"
		except Exception:
			print("[linkedin.step1] password input not found")
			yield "password_input_not_found"
			return
			
		try:
			await page.locator(f"xpath={SELECTORS['signin_button_xpath']}").click()
			yield "signin button clicked"
		except Exception as e:
			print(f"[linkedin.step1] sign-in button click error: {e}")
			yield "signin button click failed"
			return

		# Wait for redirect to feed
		try:
			await page.wait_for_url(SELECTORS.get("feed_url", "https://www.linkedin.com/feed/") + "*")
			yield "login successful, on feed"
			return
		except Exception:
			yield "wait for redirect timeout"

		# Fallback: check if on feed page
		if page.url.startswith(SELECTORS.get("feed_url", "https://www.linkedin.com/feed/")):
			yield "on feed, login successful"
			return

		print("[linkedin.step1] Credentials login did not complete; require manual login")
		yield "credentials login incomplete"
		
	except Exception as e:
		print(f"[linkedin.step1] error: {e}")
		yield "credential login failed"


# Open Jobs Page
async def open_jobs_page(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
	print("LinkedIn: open/reset dedicated Jobs page")
	context = ctx["browser_context"]
	await ensure_selectors(ctx)
	try:
		# Close other LinkedIn pages (except potential UI page)
		for p in list(context.pages):
			try:
				if p is ctx.get("jobs_page"):
					continue
				u = p.url or ""
				if "linkedin.com" in u and "127.0.0.1:6666" not in u:
					await p.close()
			except Exception:
				pass
		# Create fresh Jobs page
		jobs_page = await context.new_page()
		await jobs_page.goto(SELECTORS.get("jobs_url", "https://www.linkedin.com/jobs/"), wait_until="domcontentloaded")
		ctx["jobs_page"] = jobs_page
		yield "jobs page loaded"
	except Exception as e:
		print(f"[linkedin.open_jobs_page] error: {e}")
		yield "failed opening jobs page"


# Load Applied Job IDs
async def load_applied_job_ids(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
	print("LinkedIn Step2: load applied job IDs")
	job_ids = set()
	try:
		with open("deknilJobsIds.json", 'r', encoding='utf-8') as file:
			data = json.load(file)
			job_ids = set(data) if isinstance(data, list) else set()
		print(f"Loaded {len(job_ids)} applied job IDs")
	except FileNotFoundError:
		print("deknilJobsIds.json not found, starting fresh")
	except Exception as e:
		print(f"Error loading job IDs: {e}")
	
	ctx["applied_job_ids"] = job_ids
	yield "applied job IDs loaded"


# Show Manual Login Prompt
async def show_manual_login_prompt(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
	print("LinkedIn Step3: prompt manual login via dashboard banner")
	context = ctx["browser_context"]
	try:
		ui_page = None
		for p in context.pages:
			if "127.0.0.1:6666" in (p.url or ""):
				ui_page = p
				break
				
		if ui_page is None:
			ui_page = await context.new_page()
			try:
				await ui_page.goto("http://127.0.0.1:6666/")
			except Exception:
				pass
				
		try:
			await ui_page.bring_to_front()
		except Exception:
			pass
			
		try:
			await ui_page.evaluate("""
		(() => {
			const id = 'guu-signin-banner-linkedin';
			if (document.getElementById(id)) return;
			const div = document.createElement('div');
			div.id = id;
			div.textContent = 'Please sign in to linkedin.com in the other tab, then resume the bot.';
			Object.assign(div.style, {
				position: 'fixed',
				top: '12px',
				left: '50%',
				transform: 'translateX(-50%)',
				background: '#2563eb',
				color: '#fff',
				padding: '10px 14px',
				borderRadius: '6px',
				boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
				zIndex: 2147483647
			});
			document.body.appendChild(div);
			setTimeout(() => { try { div.remove(); } catch(e) {} }, 15000);
		})();
		""")
		except Exception:
			pass
			
		yield "prompt displayed to user"
		
	except Exception as e:
		print(f"[linkedin.step3] error: {e}")
		yield "error showing manual login"


# Set Search Location
async def set_search_location(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
	print("LinkedIn set_search_location: update jobs search location")
	context = ctx["browser_context"]
	page = ctx.get("jobs_page")
	await ensure_selectors(ctx)
	if page is None:
		print("[linkedin.set_search_location] jobs_page missing; waiting")
		yield "jobs page missing"
		return

	settings = load_settings(str(ctx.get("base_dir", ".")), "linkedin")
	search_settings = settings.get("search", {})
	location_value = ((search_settings.get("search_location") or {}).get("value") or "").strip()

	if not location_value:
		print("[linkedin.set_search_location] No location in settings; skipping")
		yield "no search location in settings"
		return

	try:
		selector_candidates = (SELECTORS.get("jobs", {}).get("location_input_candidates") or [])
		location_input = None
		for sel in selector_candidates:
			candidate = page.locator(sel)
			if await candidate.count() > 0:
				location_input = candidate.first
				break
		
		if location_input is None:
			print("[linkedin.set_search_location] location input not found")
			yield "location input not found"
			return

		await location_input.click()
		try:
			await location_input.press("Control+A")
			await location_input.press("Delete")
		except Exception:
			pass
		await location_input.fill(location_value)
		try:
			await location_input.press("Enter")
		except Exception:
			pass

		try:
			cancel_css = SELECTORS.get("jobs", {}).get("cancel_button", {}).get("css", "button[aria-label='Cancel']")
			cancel_button = page.locator(cancel_css)
			if await cancel_button.count() > 0:
				await cancel_button.first.click()
		except Exception:
			pass

		ctx["search_location"] = location_value
		yield "search location set"
	except Exception as e:
		print(f"[linkedin.set_search_location] error: {e}")
		yield "failed setting search location"


# Set Search Keywords
async def set_search_keywords(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
	print("LinkedIn set_search_keywords: update jobs search keywords")
	context = ctx["browser_context"]
	page = ctx.get("jobs_page")
	await ensure_selectors(ctx)
	if page is None:
		print("[linkedin.set_search_keywords] jobs_page missing; waiting")
		yield "jobs page missing"
		return

	settings = load_settings(str(ctx.get("base_dir", ".")), "linkedin")
	search_settings = settings.get("search", {})
	terms_value = (search_settings.get("search_terms") or {}).get("value")
	keyword_value = ""
	if isinstance(terms_value, list) and len(terms_value) > 0:
		first = terms_value[0]
		keyword_value = first.strip() if isinstance(first, str) else str(first)
	elif isinstance(terms_value, str):
		keyword_value = terms_value.strip()

	if not keyword_value:
		print("[linkedin.set_search_keywords] No keywords in settings; skipping")
		yield "no keywords in settings"
		return

	try:
		# Find the keywords input
		selector_candidates = (SELECTORS.get("jobs", {}).get("keywords_input_candidates") or [])
		keywords_input = None
		for sel in selector_candidates:
			candidate = page.locator(sel)
			if await candidate.count() > 0:
				keywords_input = candidate.first
				break

		if keywords_input is None:
			print("[linkedin.set_search_keywords] keywords input not found")
			yield "keywords input not found"
			return

		await keywords_input.click()
		try:
			await keywords_input.press("Control+A")
			await keywords_input.press("Delete")
		except Exception:
			pass
		await keywords_input.fill(keyword_value)
		# Confirm entry
		try:
			await keywords_input.press("Enter")
		except Exception:
			pass

		# Optional: click search button if present
		try:
			search_btn = page.locator("button[aria-label='Search'], button[aria-label*='Search']")
			if await search_btn.count() > 0:
				await search_btn.first.click()
		except Exception:
			pass

		ctx["search_keywords"] = keyword_value
		yield "search keywords set"
	except Exception as e:
		print(f"[linkedin.set_search_keywords] error: {e}")
		yield "failed setting search keywords"


# Apply Filters
async def apply_filters(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
    print("LinkedIn apply_filters: apply basic job search filters")
    context = ctx["browser_context"]
    page = ctx.get("jobs_page")
    await ensure_selectors(ctx)

    if page is None:
        print("[linkedin.apply_filters] jobs_page missing; continuing without filters")
        yield "jobs page missing"
        return

    settings = load_settings(str(ctx.get("base_dir", ".")), "linkedin")
    search_settings = settings.get("search", {})
    date_posted = ((search_settings.get("date_posted") or {}).get("value") or "").strip()
    job_types_raw = (search_settings.get("job_type") or {}).get("value")
    if isinstance(job_types_raw, list):
        job_types = [str(v).strip() for v in job_types_raw if str(v).strip()]
    elif isinstance(job_types_raw, str) and job_types_raw.strip():
        job_types = [job_types_raw.strip()]
    else:
        job_types = []
    easy_apply_only = bool((search_settings.get("easy_apply_only") or {}).get("value") or False)

    print(f"[linkedin.apply_filters] Settings: date_posted='{date_posted}', job_types={job_types}, easy_apply_only={easy_apply_only}")

    try:
        # Debug: Check for filter-related elements
        print("[linkedin.apply_filters] Checking for filter elements...")

        # Check for All filters button
        all_filters_selectors = [
            "button:has-text('All filters')",
            "//button[normalize-space()='All filters']",
            "button[aria-label*='All filters']",
            "button[data-test-reusables-filters-modal-trigger]"
        ]

        all_filters_found = False
        for selector in all_filters_selectors:
            try:
                btn = page.locator(selector)
                count = await btn.count()
                print(f"[linkedin.apply_filters] Found {count} elements with selector: {selector}")
                if count > 0:
                    all_filters_found = True
                    break
            except Exception as e:
                print(f"[linkedin.apply_filters] Error checking selector '{selector}': {e}")

        # Open All filters if found
        if all_filters_found:
            try:
                print("[linkedin.apply_filters] Attempting to open All filters...")
                await btn.first.click()
                print("[linkedin.apply_filters] Successfully clicked All filters")
            except Exception as e:
                print(f"[linkedin.apply_filters] Error clicking All filters: {e}")
        else:
            print("[linkedin.apply_filters] All filters button not found, skipping filter application")

        # Helper to click item by its visible text if present
        async def click_by_text(text_value: str) -> None:
            if not text_value:
                return
            print(f"[linkedin.apply_filters] Attempting to click: '{text_value}'")
            try:
                text_selectors = [
                    f"text=\"{text_value}\"",
                    f"//span[normalize-space()=\"{text_value}\"]",
                    f"//button[normalize-space()=\"{text_value}\"]",
                    f"//label[normalize-space()=\"{text_value}\"]",
                    f"//div[normalize-space()=\"{text_value}\"]"
                ]

                clicked = False
                for selector in text_selectors:
                    try:
                        loc = page.locator(selector)
                        count = await loc.count()
                        if count > 0:
                            await loc.first.click()
                            print(f"[linkedin.apply_filters] Successfully clicked '{text_value}' using selector: {selector}")
                            clicked = True
                            break
                    except Exception as e:
                        print(f"[linkedin.apply_filters] Failed to click '{text_value}' with selector '{selector}': {e}")
                        continue

                if not clicked:
                    print(f"[linkedin.apply_filters] Could not find or click '{text_value}' with any selector")

            except Exception as e:
                print(f"[linkedin.apply_filters] Error in click_by_text for '{text_value}': {e}")

        # Date posted
        if date_posted:
            print(f"[linkedin.apply_filters] Applying date posted filter: '{date_posted}'")
            await click_by_text(date_posted)

        # Job type (multi-select)
        for jt in job_types:
            print(f"[linkedin.apply_filters] Applying job type filter: '{jt}'")
            await click_by_text(jt)

        # Easy Apply toggle
        if easy_apply_only:
            print("[linkedin.apply_filters] Attempting to enable Easy Apply filter")
            try:
                easy_apply_text = SELECTORS.get("texts", {}).get("easy_apply", "Easy Apply")
                easy_apply_selectors = [
                    f"button:has-text('{easy_apply_text}')",
                    f"//button[normalize-space()='{easy_apply_text}']",
                    "input[type='checkbox'][aria-label*='Easy Apply']",
                    "//input[@type='checkbox' and contains(@aria-label, 'Easy Apply')]"
                ]

                easy_apply_clicked = False
                for selector in easy_apply_selectors:
                    try:
                        btn = page.locator(selector)
                        count = await btn.count()
                        if count > 0:
                            await btn.first.click()
                            print(f"[linkedin.apply_filters] Successfully enabled Easy Apply using selector: {selector}")
                            easy_apply_clicked = True
                            break
                    except Exception as e:
                        print(f"[linkedin.apply_filters] Failed to enable Easy Apply with selector '{selector}': {e}")
                        continue

                if not easy_apply_clicked:
                    print("[linkedin.apply_filters] Could not find or enable Easy Apply filter")

            except Exception as e:
                print(f"[linkedin.apply_filters] Error enabling Easy Apply: {e}")

        # Apply/Show results
        print("[linkedin.apply_filters] Attempting to apply filters and show results...")
        show_results_clicked = False
        try:
            show_results_selectors = [
                "button[aria-label*='Apply current filters to show']",
                "//button[contains(@aria-label, 'Apply current filters to show')]",
                "button:has-text('Show results')",
                "//button[normalize-space()='Show results']",
                "button[data-test-reusables-filters-modal-show-results-button]",
                "//button[@data-test-reusables-filters-modal-show-results-button]"
            ]

            for selector in show_results_selectors:
                try:
                    show_btn = page.locator(selector)
                    count = await show_btn.count()
                    print(f"[linkedin.apply_filters] Found {count} elements with selector: {selector}")
                    if count > 0:
                        try:
                            await show_btn.first.click(timeout=5000)  # 5 second timeout
                            print(f"[linkedin.apply_filters] Successfully clicked Show results using selector: {selector}")
                            show_results_clicked = True
                            break
                        except Exception as click_error:
                            print(f"[linkedin.apply_filters] Click failed with selector '{selector}': {click_error}")
                            continue
                except Exception as e:
                    print(f"[linkedin.apply_filters] Failed to click Show results with selector '{selector}': {e}")
                    continue

            if not show_results_clicked:
                print("[linkedin.apply_filters] Could not find or click Show results button")

        except Exception as e:
            print(f"[linkedin.apply_filters] Error clicking Show results: {e}")

        if not show_results_clicked:
            print("[linkedin.apply_filters] Attempting to close filter modal and continue...")
            try:
                close_selectors = [
                    "button[aria-label='Dismiss']",
                    "//button[@aria-label='Dismiss']",
                    "button:has-text('Cancel')",
                    "//button[normalize-space()='Cancel']",
                    "button[aria-label='Close']",
                    "//button[@aria-label='Close']"
                ]

                for close_selector in close_selectors:
                    try:
                        close_btn = page.locator(close_selector)
                        if await close_btn.count() > 0:
                            await close_btn.first.click(timeout=3000)
                            print(f"[linkedin.apply_filters] Closed modal using selector: {close_selector}")
                            break
                    except Exception:
                        continue

                try:
                    await page.keyboard.press("Escape")
                    print("[linkedin.apply_filters] Pressed Escape to close modal")
                except Exception:
                    pass

            except Exception as e:
                print(f"[linkedin.apply_filters] Error closing modal: {e}")

        print("[linkedin.apply_filters] Filter application completed successfully")
        yield "filters applied successfully"

    except Exception as e:
        print(f"[linkedin.apply_filters] error: {e}")
        print("[linkedin.apply_filters] Continuing without filters due to error")
        yield "filters application failed"



# Get Page Information
async def get_page_info(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
	print("LinkedIn get_page_info: detect pagination and current page")
	context = ctx["browser_context"]
	page = ctx.get("jobs_page")
	await ensure_selectors(ctx)
	if page is None:
		print("[linkedin.get_page_info] jobs_page missing; waiting")
		yield "jobs page missing"
		return
	try:
		pagination_container = None
		selector_candidates = (SELECTORS.get("pagination", {}).get("container_candidates") or [])
		for sel in selector_candidates:
			candidate = page.locator(sel)
			if await candidate.count() > 0:
				pagination_container = candidate.first
				break

		if pagination_container is None:
			print("[linkedin.get_page_info] pagination container not found")
			ctx["has_pagination"] = False
			ctx["pagination_current_page"] = None
			yield "pagination not found"
			return

		try:
			await pagination_container.scroll_into_view_if_needed()
		except Exception:
			pass

		current_page_num = None
		sub_candidates = (SELECTORS.get("pagination", {}).get("active_page_candidates") or [])
		for sub in sub_candidates:
			active_loc = pagination_container.locator(sub)
			if await active_loc.count() > 0:
				try:
					text_value = (await active_loc.first.inner_text()).strip()
				except Exception:
					try:
						text_value = (await active_loc.first.text_content()) or ""
						text_value = text_value.strip()
					except Exception:
						text_value = ""
				# Try parse number from text
				digits = "".join(ch for ch in text_value if ch.isdigit())
				if digits:
					try:
						current_page_num = int(digits)
						break
					except Exception:
						pass
				# Fallback to aria-label like "Page 3"
				try:
					aria_label = await active_loc.first.get_attribute("aria-label")
					if aria_label:
						digits = "".join(ch for ch in aria_label if ch.isdigit())
						if digits:
							current_page_num = int(digits)
							break
				except Exception:
					pass

		ctx["has_pagination"] = True
		ctx["pagination_current_page"] = current_page_num
		print(f"[linkedin.get_page_info] current page: {current_page_num}")
		yield "page info extracted"
	except Exception as e:
		print(f"[linkedin.get_page_info] error: {e}")
		yield "failed extracting page info"


# Extract Job Details
async def extract_job_details(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
    """
    Extract job information from the current LinkedIn jobs page.
    Structured logging for readability and AI post-processing.
    """
    print("[extract_job_details] Starting job extraction...")
    context = ctx["browser_context"]
    page = ctx.get("jobs_page")
    await ensure_selectors(ctx)

    if page is None:
        print("[extract_job_details] No jobs_page found; waiting...")
        yield "no jobs page found"
        return

    try:
        print("[extract_job_details] Scanning for job-related elements...")
        yield "checking for job elements"

        # Collect element counts
        counts = {
            "anchors": await page.locator("a").count(),
            "job_cards_with_id": await page.locator("[data-occludable-job-id]").count(),
            "titles": await page.locator(".job-card-list__title").count(),
            "containers": await page.locator(".job-card-container").count(),
            "primary_descriptions": await page.locator(".job-card-container__primary-description").count(),
            "metadata_items": await page.locator(".job-card-container__metadata-item").count(),
            "entity_subtitles": await page.locator(".artdeco-entity-lockup__subtitle").count(),
            "footer_states": await page.locator(".job-card-container__footer-job-state").count(),
            "job_details_containers": await page.locator(".jobs-search__job-details--container").count(),
            "li_job_details": await page.locator("li.jobs-search__job-details--container").count(),
        }

        print("[extract_job_details] Element counts:")
        for key, val in counts.items():
            print(f"   {key}: {val}")

        yield "found job elements"

        # Pick best selector for job cards
        job_cards = None
        job_count = 0

        if counts["li_job_details"] > 0:
            job_cards = page.locator("li.jobs-search__job-details--container")
            job_count = counts["li_job_details"]
            print("[extract_job_details] Using selector: li.jobs-search__job-details--container")
            yield "using li selector"

        elif counts["job_cards_with_id"] > 0:
            job_cards = page.locator("[data-occludable-job-id]")
            job_count = counts["job_cards_with_id"]
            print("[extract_job_details] Using selector: [data-occludable-job-id]")
            yield "using data-occludable selector"

        elif counts["containers"] > 0:
            job_cards = page.locator(".job-card-container")
            job_count = counts["containers"]
            print("[extract_job_details] Using selector: .job-card-container")
            yield "using job container selector"

        else:
            print("[extract_job_details] No job cards found with any selector")
            ctx["extracted_jobs"] = []
            yield "no_job_cards_found"
            return

        print(f"[extract_job_details] Total job cards found: {job_count}")
        yield "extracting job details"

        extracted_jobs = []

        for i in range(job_count):
            try:
                job_card = job_cards.nth(i)
                await scroll_to_view(page, job_card, top=True)

                # Job ID
                job_id = await job_card.get_attribute("data-occludable-job-id")
                if not job_id:
                    id_element = job_card.locator("[data-occludable-job-id]")
                    if await id_element.count() > 0:
                        job_id = await id_element.first.get_attribute("data-occludable-job-id")

                if not job_id:
                    print(f"[extract_job_details] Job {i+1}: No job ID, skipping.")
                    continue

                # Title
                title = ""
                for sel in [
                    "a.job-card-list__title",
                    ".job-card-list__title",
                    "a[data-control-name='jobdetails_title']",
                    "h3",
                    "a",
                ]:
                    el = job_card.locator(sel)
                    if await el.count() > 0:
                        try:
                            t = await el.first.inner_text()
                            if t and t.strip():
                                title = t.split("\n")[0].strip()
                                break
                        except Exception:
                            continue
                if not title:
                    print(f"[extract_job_details] Job {i+1}: No title, skipping.")
                    continue

                # Company & location
                company = ""
                work_location = ""
                work_style = ""

                subtitle = job_card.locator(".artdeco-entity-lockup__subtitle")
                if await subtitle.count() > 0:
                    try:
                        raw = await subtitle.first.inner_text()
                        if raw:
                            idx = raw.find(" · ")
                            if idx != -1:
                                company = raw[:idx].strip()
                                loc_full = raw[idx+3:].strip()
                                if loc_full.endswith(")"):
                                    paren = loc_full.rfind("(")
                                    if paren != -1:
                                        work_style = loc_full[paren+1:-1]
                                        work_location = loc_full[:paren].strip()
                                else:
                                    work_location = loc_full
                            else:
                                company = raw.strip()
                    except Exception as e:
                        print(f"[extract_job_details] Subtitle parse error: {e}")

                if not company:
                    desc = job_card.locator(".job-card-container__primary-description")
                    if await desc.count() > 0:
                        try:
                            company = (await desc.first.inner_text()).strip()
                        except Exception:
                            pass

                if not company:
                    for sel in [
                        ".job-card-container__company-name",
                        ".job-card-container__subtitle",
                        "[data-control-name='jobdetails_company_name']",
                        ".job-card-container__metadata-item:first-child",
                    ]:
                        el = job_card.locator(sel)
                        if await el.count() > 0:
                            try:
                                company = (await el.first.inner_text()).strip()
                                if company:
                                    break
                            except Exception:
                                continue

                if not work_location:
                    meta = job_card.locator(".job-card-container__metadata-item")
                    for j in range(await meta.count()):
                        try:
                            txt = (await meta.nth(j).inner_text()).strip()
                            if any(word in txt for word in ["Remote", "On-site", "Hybrid", ","]):
                                work_location = txt
                                break
                        except Exception:
                            continue

                if not work_location:
                    for sel in [
                        ".job-card-container__location",
                        "[data-control-name='jobdetails_location']",
                        ".job-card-container__metadata-item:last-child",
                    ]:
                        el = job_card.locator(sel)
                        if await el.count() > 0:
                            try:
                                work_location = (await el.first.inner_text()).strip()
                                if work_location:
                                    break
                            except Exception:
                                continue

                # Applied check
                is_applied = False
                for sel in [
                    ".job-card-container__footer-job-state",
                    "[data-control-name='jobdetails_apply_button']",
                    "button:has-text('Applied')",
                ]:
                    el = job_card.locator(sel)
                    if await el.count() > 0:
                        try:
                            txt = await el.first.inner_text()
                            if "Applied" in txt:
                                is_applied = True
                                break
                        except Exception:
                            continue

                job_info = {
                    "job_id": job_id,
                    "title": title,
                    "company": company,
                    "work_location": work_location,
                    "work_style": work_style,
                    "is_applied": is_applied,
                }
                extracted_jobs.append(job_info)

                print(f"[extract_job_details] Job {i+1}/{job_count}")
                print(f"   id: {job_id}")
                print(f"   title: {title}")
                print(f"   company: {company}")
                print(f"   location: {work_location}")
                print(f"   work_style: {work_style}")
                print(f"   applied: {is_applied}")

                if (i + 1) % 5 == 0:
                    yield "progress on extraction"

            except Exception as e:
                print(f"[extract_job_details] Job {i+1}: extraction error: {e}")
                continue

        ctx["extracted_jobs"] = extracted_jobs
        print(f"[extract_job_details] Extraction complete: {len(extracted_jobs)} jobs.")
        yield "finished extracting jobs"
        yield "proceed to process jobs"

    except Exception as e:
        print(f"[extract_job_details] Fatal extraction error: {e}")
        yield "failed extracting jobs"


# Process Jobs
async def process_jobs(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
    """
    Process each extracted job: check blacklists, extract details, apply if eligible
    """
    print("LinkedIn process_jobs: start processing extracted jobs")
    
    try:
        extracted_jobs = ctx.get("extracted_jobs", [])
        applied_job_ids = ctx.get("applied_job_ids", set())
        rejected_jobs = ctx.get("rejected_jobs", set())
        blacklisted_companies = ctx.get("blacklisted_companies", set())
        
        if not extracted_jobs:
            print("[linkedin.process_jobs] No jobs to process")
            yield "no jobs to process"
            return
        
        # Initialize job processing
        ctx["current_job_index"] = 0
        ctx["current_job"] = extracted_jobs[0]
        ctx["rejected_jobs"] = rejected_jobs
        ctx["blacklisted_companies"] = blacklisted_companies
        
        print(f"[linkedin.process_jobs] Starting to process {len(extracted_jobs)} jobs")
        
        # Start with the first job
        yield "starting to process jobs"
        
    except Exception as e:
        print(f"[linkedin.process_jobs] error: {e}")
        yield "finish"


async def check_job_blacklist(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
    """
    Check if job/company contains blacklisted words
    """
    print("LinkedIn check_job_blacklist: check for blacklisted content")
    page = ctx.get("jobs_page")
    await ensure_selectors(ctx)
    
    if page is None:
        print("[linkedin.check_job_blacklist] jobs_page missing; waiting")
        yield "jobs page missing"
        return

    try:
        job_info = ctx.get("current_job", {})
        if not job_info:
            print("[linkedin.check_job_blacklist] No current job to check")
            yield "job not blacklisted"
            return
        
        # Click on job to load details
        job_card = page.locator(f"[data-occludable-job-id='{job_info['job_id']}']")
        if await job_card.count() > 0:
            await job_card.click()
            await asyncio.sleep(2)  # Wait for details to load
        
        # Extract about company text
        about_company_element = page.locator(".jobs-company__box")
        if await about_company_element.count() > 0:
            about_company_text = await about_company_element.inner_text()
            
            # Load blacklisted words from settings - look in search section
            settings = load_settings(str(ctx.get("base_dir", ".")), "linkedin")
            search_settings = settings.get("search", {})
            blacklisted_words = search_settings.get("about_company_bad_words", [])
            
            # Check for blacklisted words
            for word in blacklisted_words:
                if word.lower() in about_company_text.lower():
                    # Add to rejected jobs
                    rejected_jobs = ctx.get("rejected_jobs", set())
                    rejected_jobs.add(job_info["job_id"])
                    ctx["rejected_jobs"] = rejected_jobs
                    
                    print(f"[linkedin.check_job_blacklist] Job {job_info['job_id']} contains blacklisted word: {word}")
                    yield "job blacklisted"
                    return
            
            print(f"[linkedin.check_job_blacklist] Job {job_info['job_id']} passed blacklist check")
            yield "job not blacklisted"
        else:
            print("[linkedin.check_job_blacklist] Could not find company info, proceeding")
            yield "job not blacklisted"
            
    except Exception as e:
        print(f"[linkedin.check_job_blacklist] error: {e}")
        yield "job not blacklisted"


# Extract Job Description
async def extract_job_description(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
    """
    Extract job description and check for experience requirements
    """
    print("LinkedIn extract_job_description: extract job description")
    page = ctx.get("jobs_page")
    await ensure_selectors(ctx)
    
    if page is None:
        print("[linkedin.extract_job_description] jobs_page missing; waiting")
        yield "jobs page missing"
        return

    try:
        # Wait for job description to load
        description_element = page.locator(".jobs-box__html-content")
        if await description_element.count() > 0:
            job_description = await description_element.inner_text()
            
            # Load bad words from settings - look in search section
            settings = load_settings(str(ctx.get("base_dir", ".")), "linkedin")
            search_settings = settings.get("search", {})
            bad_words = search_settings.get("bad_words", [])
            
            # Check for bad words
            for word in bad_words:
                if word.lower() in job_description.lower():
                    print(f"[linkedin.extract_job_description] Job contains bad word: {word}")
                    yield "could not find description"
                    return
            
            # Extract experience requirements
            experience_required = extract_years_of_experience(job_description)
            
            ctx["job_description"] = job_description
            ctx["experience_required"] = experience_required
            
            print(f"[linkedin.extract_job_description] Experience required: {experience_required}")
            yield "job description extracted"
        else:
            print("[linkedin.extract_job_description] Could not find job description")
            yield "could not find description"
            
    except Exception as e:
        print(f"[linkedin.extract_job_description] error: {e}")
        yield "could not find description"

#
def extract_years_of_experience(text: str) -> int:
    """
    Extract years of experience required from job description text
    """
    import re
    
    # Pattern to match experience requirements like "5+ years", "3-5 years", etc.
    experience_pattern = r'(\d+)\+?\s*year[s]?'
    matches = re.findall(experience_pattern, text, re.IGNORECASE)
    
    if matches:
        # Return the highest experience requirement found
        return max([int(match) for match in matches if int(match) <= 20])
    
    return 0


async def attempt_easy_apply(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
    """
    Attempt to apply using Easy Apply button
    """
    print("LinkedIn attempt_easy_apply: check for Easy Apply button")
    page = ctx.get("jobs_page")
    await ensure_selectors(ctx)
    
    if page is None:
        print("[linkedin.attempt_easy_apply] jobs_page missing; waiting")
        yield "no jobs page found"
        return

    try:
        # Get current job info
        job_info = ctx.get("current_job", {})
        if not job_info:
            print("[linkedin.attempt_easy_apply] No current job to process")
            yield "no job to process"
            return
        
        job_id = job_info.get("job_id")
        job_title = job_info.get("title", "Unknown")
        company = job_info.get("company", "Unknown")
        
        print(f"[linkedin.attempt_easy_apply] Processing job: {job_title} at {company} (ID: {job_id})")
        yield f"processing job: {job_title} at {company}"
        
        # First, click on the job to load its details
        if job_id:
            job_card = page.locator(f"[data-occludable-job-id='{job_id}']")
            if await job_card.count() > 0:
                await job_card.click()
                print(f"[linkedin.attempt_easy_apply] Clicked on job {job_id} to load details")
                yield "job details loaded"
                await asyncio.sleep(2)  # Wait for job details to load
            else:
                print(f"[linkedin.attempt_easy_apply] Could not find job card for ID {job_id}")
                yield "job_card_not_found"
                return
        
        # Look for Easy Apply button - try multiple selectors
        easy_apply_selectors = [
            "button[aria-label*='Easy Apply']",
            "button[aria-label*='easy apply']",
            "//button[contains(@aria-label, 'Easy Apply')]",
            "//button[contains(@aria-label, 'easy apply')]",
            "button:has-text('Easy Apply')",
            "//button[normalize-space()='Easy Apply']",
            "button[data-control-name='jobdetails_topcard_inapply']",
            "//button[@data-control-name='jobdetails_topcard_inapply']"
        ]
        
        easy_apply_button = None
        selected_selector = None
        
        for selector in easy_apply_selectors:
            try:
                button = page.locator(selector)
                count = await button.count()
                if count > 0:
                    easy_apply_button = button.first
                    selected_selector = selector
                    print(f"[linkedin.attempt_easy_apply] Found Easy Apply button with selector: {selector}")
                    yield f"easy apply button found: {selector}"
                    break
            except Exception as e:
                print(f"[linkedin.attempt_easy_apply] Error checking selector '{selector}': {e}")
                continue
        
        if easy_apply_button:
            try:
                # Scroll to button and click
                await scroll_to_view(page, easy_apply_button, top=True)
                await asyncio.sleep(1)  # Small delay to ensure element is stable
                await easy_apply_button.click()
                print("[linkedin.attempt_easy_apply] Successfully clicked Easy Apply button")
                yield "easy apply button clicked"
                
                # Wait for modal to appear
                await asyncio.sleep(2)
                yield "application modal opened"
                yield "proceeding to resume upload"
            except Exception as e:
                print(f"[linkedin.attempt_easy_apply] Error clicking Easy Apply button: {e}")
                yield "failed to click easy apply"
                yield "attempting external apply"
        else:
            print("[linkedin.attempt_easy_apply] No Easy Apply button found, trying external apply")
            yield "no easy apply button found"
            yield "attempting external apply"
            
    except Exception as e:
        print(f"[linkedin.attempt_easy_apply] error: {e}")
        yield "easy apply process error"


async def upload_resume(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
    """
    Upload resume in the Easy Apply modal
    """
    print("LinkedIn upload_resume: upload resume file")
    page = ctx.get("jobs_page")
    await ensure_selectors(ctx)
    
    if page is None:
        print("[linkedin.upload_resume] jobs_page missing; waiting")
        yield "jobs page missing"
        return

    try:
        # Load resume path from settings - look in questions section
        settings = load_settings(str(ctx.get("base_dir", ".")), "linkedin")
        questions_settings = settings.get("questions", {})
        resume_path = ((questions_settings.get("default_resume_path") or {}).get("value") or "").strip()
        
        if not resume_path:
            print("[linkedin.upload_resume] No resume path configured, skipping upload")
            yield "no resume path configured"
            return
            
        # Check if resume file exists
        if not os.path.exists(resume_path):
            print(f"[linkedin.upload_resume] Resume file not found: {resume_path}")
            yield "resume file not found"
            return

        # Look for file input in the modal
        file_input_selectors = [
            "input[type='file']",
            "input[name='file']",
            "//input[@type='file']",
            "//input[@name='file']"
        ]
        
        file_input = None
        for selector in file_input_selectors:
            try:
                input_element = page.locator(selector)
                count = await input_element.count()
                if count > 0:
                    file_input = input_element.first
                    print(f"[linkedin.upload_resume] Found file input with selector: {selector}")
                    break
            except Exception as e:
                print(f"[linkedin.upload_resume] Error checking selector '{selector}': {e}")
                continue
        
        if file_input:
            try:
                # Upload the resume file
                await file_input.set_input_files(resume_path)
                print(f"[linkedin.upload_resume] Successfully uploaded resume: {os.path.basename(resume_path)}")
                
                # Wait for upload to complete
                await asyncio.sleep(2)
                
                # Store resume info in context
                ctx["uploaded_resume"] = os.path.basename(resume_path)
                ctx["resume_path"] = resume_path
                
                yield "resume uploaded successfully"
            except Exception as e:
                print(f"[linkedin.upload_resume] Error uploading resume: {e}")
                yield "proceeding without resume"
        else:
            print("[linkedin.upload_resume] No file input found, proceeding without resume upload")
            yield "proceeding without resume"
            
    except Exception as e:
        print(f"[linkedin.upload_resume] error: {e}")
        yield "proceeding without resume"


async def answer_questions(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
    """
    Answer questions in the Easy Apply modal
    """
    print("LinkedIn answer_questions: answer application questions")
    page = ctx.get("jobs_page")
    await ensure_selectors(ctx)
    
    if page is None:
        print("[linkedin.answer_questions] jobs_page missing; waiting")
        yield "jobs page missing"
        return

    try:
        # Load user information from settings
        settings = load_settings(str(ctx.get("base_dir", ".")), "linkedin")
        personals_settings = settings.get("personals", {})
        questions_settings = settings.get("questions", {})
        
        # Extract user information from personals section
        first_name = ((personals_settings.get("first_name") or {}).get("value") or "").strip()
        last_name = ((personals_settings.get("last_name") or {}).get("value") or "").strip()
        full_name = f"{first_name} {last_name}".strip()
        phone_number = ((personals_settings.get("phone_number") or {}).get("value") or "").strip()
        
        # Extract user information from questions section
        years_of_experience = ((questions_settings.get("years_of_experience") or {}).get("value") or "").strip()
        email = ((questions_settings.get("email") or {}).get("value") or "").strip()
        
        # If email not in questions, try to get from secrets (username might be email)
        if not email:
            secrets_settings = settings.get("secrets", {})
            email = ((secrets_settings.get("username") or {}).get("value") or "").strip()
        
        # Find all form elements
        form_elements = page.locator("[data-test-form-element]")
        form_count = await form_elements.count()
        
        print(f"[linkedin.answer_questions] Found {form_count} form elements to process")
        
        for i in range(form_count):
            try:
                element = form_elements.nth(i)
                
                # Determine question type and answer accordingly
                question_type = await determine_question_type(element)
                answer = await generate_answer(question_type, ctx, {
                    "first_name": first_name,
                    "last_name": last_name,
                    "full_name": full_name,
                    "phone_number": phone_number,
                    "email": email,
                    "years_of_experience": years_of_experience
                })
                
                await fill_answer(element, answer, question_type)
                
            except Exception as e:
                print(f"[linkedin.answer_questions] Error processing form element {i}: {e}")
                continue
        
        print("[linkedin.answer_questions] Finished answering questions")
        yield "finished answering questions"
        
    except Exception as e:
        print(f"[linkedin.answer_questions] error: {e}")
        yield "error answering questions"


async def determine_question_type(element) -> str:
    """
    Determine the type of question/form element
    """
    try:
        # Check for select dropdown
        select_element = element.locator("select")
        if await select_element.count() > 0:
            return "select"
        
        # Check for radio buttons
        radio_element = element.locator("input[type='radio']")
        if await radio_element.count() > 0:
            return "radio"
        
        # Check for text input
        text_input = element.locator("input[type='text']")
        if await text_input.count() > 0:
            return "text"
        
        # Check for textarea
        textarea = element.locator("textarea")
        if await textarea.count() > 0:
            return "textarea"
        
        # Check for checkbox
        checkbox = element.locator("input[type='checkbox']")
        if await checkbox.count() > 0:
            return "checkbox"
        
        return "unknown"
    except Exception:
        return "unknown"


async def generate_answer(question_type: str, ctx: Dict[str, Any], user_info: Dict[str, str]) -> str:
    """
    Generate appropriate answer based on question type and user information
    """
    try:
        # Get question label to determine what to answer
        label_element = ctx.get("jobs_page").locator("label")
        label_text = ""
        if await label_element.count() > 0:
            label_text = (await label_element.first.inner_text()).lower()
        
        if question_type == "text":
            if "name" in label_text:
                if "first" in label_text:
                    return user_info.get("first_name", "")
                elif "last" in label_text:
                    return user_info.get("last_name", "")
                else:
                    return user_info.get("full_name", "")
            elif "phone" in label_text or "mobile" in label_text:
                return user_info.get("phone_number", "")
            elif "email" in label_text:
                return user_info.get("email", "")
            elif "experience" in label_text or "years" in label_text:
                return user_info.get("years_of_experience", "")
            else:
                return ""
        
        elif question_type == "select":
            # For select dropdowns, try to find appropriate option
            if "experience" in label_text:
                return "Yes"  # Default to Yes for experience questions
            else:
                return "Yes"  # Default answer
        
        elif question_type == "radio":
            # For radio buttons, default to first option
            return "Yes"
        
        elif question_type == "checkbox":
            # For checkboxes, default to checked
            return "checked"
        
        else:
            return ""
            
    except Exception as e:
        print(f"[linkedin.generate_answer] Error generating answer: {e}")
        return ""


async def fill_answer(element, answer: str, question_type: str) -> None:
    """
    Fill the answer in the appropriate form element
    """
    try:
        if question_type == "text":
            # Clear and fill text input
            text_input = element.locator("input[type='text']")
            if await text_input.count() > 0:
                await text_input.first.fill(answer)
        
        elif question_type == "textarea":
            # Clear and fill textarea
            textarea = element.locator("textarea")
            if await textarea.count() > 0:
                await textarea.first.fill(answer)
        
        elif question_type == "select":
            # Select option in dropdown
            select_element = element.locator("select")
            if await select_element.count() > 0:
                try:
                    await select_element.first.select_option(label=answer)
                except Exception:
                    # Fallback to first option
                    await select_element.first.select_option(index=1)
        
        elif question_type == "radio":
            # Click first radio button
            radio_buttons = element.locator("input[type='radio']")
            if await radio_buttons.count() > 0:
                await radio_buttons.first.click()
        
        elif question_type == "checkbox":
            # Check checkbox
            checkbox = element.locator("input[type='checkbox']")
            if await checkbox.count() > 0:
                is_checked = await checkbox.first.is_checked()
                if not is_checked:
                    await checkbox.first.click()
        
    except Exception as e:
        print(f"[linkedin.fill_answer] Error filling answer: {e}")


async def submit_application(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
    """
    Submit the Easy Apply application
    """
    print("LinkedIn submit_application: submit the application")
    page = ctx.get("jobs_page")
    await ensure_selectors(ctx)
    
    if page is None:
        print("[linkedin.submit_application] jobs_page missing; waiting")
        yield "no jobs page found"
        return

    try:
        # Get current job info for logging
        job_info = ctx.get("current_job", {})
        job_title = job_info.get("title", "Unknown")
        company = job_info.get("company", "Unknown")
        
        print(f"[linkedin.submit_application] Submitting application for: {job_title} at {company}")
        yield f"submitting application: {job_title} at {company}"
        
        # First, check if there are any "Next" buttons to click through
        next_button_selectors = [
            "button:has-text('Next')",
            "//button[normalize-space()='Next']",
            "button[aria-label*='Next']",
            "//button[contains(@aria-label, 'Next')]"
        ]
        
        next_clicked = True
        next_count = 0
        while next_clicked:
            next_clicked = False
            for selector in next_button_selectors:
                try:
                    next_btn = page.locator(selector)
                    count = await next_btn.count()
                    if count > 0:
                        await next_btn.first.click()
                        next_count += 1
                        print(f"[linkedin.submit_application] Clicked Next button #{next_count} using selector: {selector}")
                        yield f"clicked next button: {next_count}"
                        await asyncio.sleep(1)
                        next_clicked = True
                        break
                except Exception as e:
                    print(f"[linkedin.submit_application] Error clicking Next with selector '{selector}': {e}")
                    continue
        
        if next_count > 0:
            yield f"next buttons completed: {next_count}"
        
        # Look for Submit button
        submit_selectors = [
            "button:has-text('Submit application')",
            "//button[normalize-space()='Submit application']",
            "button[aria-label*='Submit application']",
            "//button[contains(@aria-label, 'Submit application')]",
            "button:has-text('Submit')",
            "//button[normalize-space()='Submit']",
            "button[aria-label*='Submit']",
            "//button[contains(@aria-label, 'Submit')]"
        ]
        
        submit_button = None
        selected_submit_selector = None
        
        for selector in submit_selectors:
            try:
                button = page.locator(selector)
                count = await button.count()
                if count > 0:
                    submit_button = button.first
                    selected_submit_selector = selector
                    print(f"[linkedin.submit_application] Found Submit button with selector: {selector}")
                    yield f"submit button found: {selector}"
                    break
            except Exception as e:
                print(f"[linkedin.submit_application] Error checking selector '{selector}': {e}")
                continue
        
        if submit_button:
            try:
                await submit_button.click()
                print("[linkedin.submit_application] Successfully clicked Submit button")
                yield "submit button clicked"
                
                # Wait for submission to complete
                await asyncio.sleep(3)
                yield "submission is processing"
                
                # Look for success confirmation
                success_selectors = [
                    "text=Application submitted",
                    "text=Submitted",
                    "//span[contains(text(), 'submitted')]",
                    "text=Your application has been submitted",
                    "//span[contains(text(), 'application has been submitted')]"
                ]
                
                success_found = False
                for selector in success_selectors:
                    try:
                        success_element = page.locator(selector)
                        if await success_element.count() > 0:
                            success_found = True
                            print("[linkedin.submit_application] Application submitted successfully")
                            yield "application_submitted_successfully"
                            break
                    except Exception:
                        continue
                
                if success_found:
                    yield "save_applied_job"
                else:
                    # Try to look for "Done" button as alternative success indicator
                    done_selectors = [
                        "button:has-text('Done')",
                        "//button[normalize-space()='Done']",
                        "button[aria-label*='Done']"
                    ]
                    
                    done_found = False
                    for selector in done_selectors:
                        try:
                            done_element = page.locator(selector)
                            if await done_element.count() > 0:
                                done_found = True
                                print("[linkedin.submit_application] Found Done button, assuming success")
                                yield "done_button_found"
                                break
                        except Exception:
                            continue
                    
                    if done_found:
                        yield "save_applied_job"
                    else:
                        print("[linkedin.submit_application] Could not confirm submission success")
                        yield "submission_confirmation_failed"
                        yield "application_failed"
                    
            except Exception as e:
                print(f"[linkedin.submit_application] Error clicking Submit button: {e}")
                yield "submit_button_click_failed"
                yield "application_failed"
        else:
            print("[linkedin.submit_application] No Submit button found")
            yield "submit_button_not_found"
            yield "application_failed"
            
    except Exception as e:
        print(f"[linkedin.submit_application] error: {e}")
        yield "submit_application_error"


async def save_applied_job(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
    """
    Save successfully applied job to tracking file
    """
    print("LinkedIn save_applied_job: save applied job info")
    
    try:
        current_job = ctx.get("current_job", {})
        applied_job_ids = ctx.get("applied_job_ids", set())
        
        if current_job and current_job.get("job_id"):
            applied_job_ids.add(current_job["job_id"])
            ctx["applied_job_ids"] = applied_job_ids
            
            with open("deknilJobsIds.json", "w") as f:
                json.dump(list(applied_job_ids), f)
            
            print(f"[linkedin.save_applied_job] Saved job ID: {current_job['job_id']}")
            yield "job_saved"
            return
        
        yield "no_job_to_save"
    
    except Exception as e:
        print(f"[linkedin.save_applied_job] error: {e}")
        yield "save_job_failed"


async def save_external_job(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
    """
    Save external job application info
    """
    print("LinkedIn save_external_job: save external job info")
    
    try:
        current_job = ctx.get("current_job", {})
        external_url = ctx.get("external_application_url", "")
        
        if current_job and current_job.get("job_id"):
            print(f"[linkedin.save_external_job] External job saved - ID: {current_job['job_id']}, URL: {external_url}")
            yield "external_job_saved"
            return
        
        yield "no_external_job"
    
    except Exception as e:
        print(f"[linkedin.save_external_job] error: {e}")
        yield "save_external_failed"


async def application_failed(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
    """
    Handle failed application attempts
    """
    print("LinkedIn application_failed: handle failed application")
    
    try:
        current_job = ctx.get("current_job", {})
        
        if current_job and current_job.get("job_id"):
            failed_jobs = ctx.get("failed_jobs", set())
            failed_jobs.add(current_job["job_id"])
            ctx["failed_jobs"] = failed_jobs
            
            print(f"[linkedin.application_failed] Added job ID to failed list: {current_job['job_id']}")
            yield "application_marked_failed"
            return
        
        yield "no_job_to_mark"
    
    except Exception as e:
        print(f"[linkedin.application_failed] error: {e}")
        yield "mark_failed_error"


async def external_apply(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
    """
    Handle external application (when Easy Apply is not available)
    """
    print("LinkedIn external_apply: handle external application")
    page = ctx.get("jobs_page")
    await ensure_selectors(ctx)
    
    if page is None:
        print("[linkedin.external_apply] jobs_page missing; waiting")
        yield "jobs page missing"
        return

    try:
        # Look for regular Apply button
        apply_selectors = [
            "button[aria-label*='Apply']",
            "button:has-text('Apply')",
            "//button[normalize-space()='Apply']"
        ]
        
        apply_button = None
        for selector in apply_selectors:
            try:
                button = page.locator(selector)
                count = await button.count()
                if count > 0:
                    apply_button = button.first
                    print(f"[linkedin.external_apply] Found Apply button with selector: {selector}")
                    break
            except Exception as e:
                print(f"[linkedin.external_apply] Error checking selector '{selector}': {e}")
                continue
        
        if apply_button:
            try:
                await apply_button.click()
                print("[linkedin.external_apply] Successfully clicked Apply button")
                
                # Wait for new tab/window to open
                context = ctx["browser_context"]
                await context.wait_for_event("page", timeout=10000)
                
                # Switch to new tab and get URL
                new_page = context.pages[-1]
                external_url = new_page.url
                
                # Store external application link
                ctx["external_application_url"] = external_url
                print(f"[linkedin.external_apply] External application URL: {external_url}")
                
                # Close external tab if configured
                settings = load_settings(str(ctx.get("base_dir", ".")), "linkedin")
                close_tabs = settings.get("close_tabs", True)
                if close_tabs:
                    await new_page.close()
                
                yield "save_external_job"
                
            except Exception as e:
                print(f"[linkedin.external_apply] Error handling external apply: {e}")
                yield "application_failed"
        else:
            print("[linkedin.external_apply] No Apply button found")
            yield "application_failed"
            
    except Exception as e:
        print(f"[linkedin.external_apply] error: {e}")
        yield "external apply process error"





async def continue_processing(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
    """
    Continue processing next job or move to next page
    """
    print("LinkedIn continue_processing: continue with next job or page")
    
    try:
        # Check if there are more jobs to process
        extracted_jobs = ctx.get("extracted_jobs", [])
        current_job_index = ctx.get("current_job_index", 0)
        
        print(f"[linkedin.continue_processing] Current job index: {current_job_index}, Total jobs: {len(extracted_jobs)}")
        yield f"processing_status: job={current_job_index + 1}/{len(extracted_jobs)}"
        
        if current_job_index < len(extracted_jobs) - 1:
            # Process next job
            next_job_index = current_job_index + 1
            ctx["current_job_index"] = next_job_index
            ctx["current_job"] = extracted_jobs[next_job_index]
            
            next_job = extracted_jobs[next_job_index]
            job_title = next_job.get("title", "Unknown")
            company = next_job.get("company", "Unknown")
            
            print(f"[linkedin.continue_processing] Moving to next job: {next_job_index + 1}/{len(extracted_jobs)} - {job_title} at {company}")
            yield f"moving to next job: {job_title} at {company}"
            yield "starting next application"
        else:
            # All jobs processed, move to next page
            print("[linkedin.continue_processing] All jobs processed, moving to next page")
            yield "all_jobs_processed"
            yield "navigate_to_next_page"
        
    except Exception as e:
        print(f"[linkedin.continue_processing] error: {e}")
        yield "continue_processing_error"
        yield "finish"


async def navigate_to_next_page(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
    """
    Navigate to next page of job results
    """
    print("LinkedIn navigate_to_next_page: go to next page")
    page = ctx.get("jobs_page")
    await ensure_selectors(ctx)
    
    if page is None:
        print("[linkedin.navigate_to_next_page] jobs_page missing; waiting")
        yield "jobs page missing"
        return

    try:
        current_page = ctx.get("pagination_current_page", 1)
        next_page_button = page.locator(f"button[aria-label='Page {current_page + 1}']")
        
        if await next_page_button.count() > 0:
            await next_page_button.click()
            ctx["pagination_current_page"] = current_page + 1
            print(f"[linkedin.navigate_to_next_page] Moved to page {current_page + 1}")
            yield "extract_job_details"
        else:
            print("[linkedin.navigate_to_next_page] No more pages available")
            yield "finish"
            
    except Exception as e:
        print(f"[linkedin.navigate_to_next_page] error: {e}")
        yield "finish"


async def finish(ctx: Dict[str, Any]) -> AsyncGenerator[str, None]:
	print("LinkedIn Finish: cleanup and stop")
	jobs_page = ctx.get("jobs_page")
	try:
		if jobs_page:
			await jobs_page.close()
			ctx.pop("jobs_page", None)
	except Exception:
		pass
	yield "done"
