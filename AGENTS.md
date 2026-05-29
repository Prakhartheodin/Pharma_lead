<claude-mem-context>
# Memory Context

# [Pharma.uat] recent context, 2026-05-29 2:11pm GMT+5:30

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (16,503t read) | 223,662t work | 93% savings

### May 29, 2026
S893 Implement location-based pharmaceutical company discovery with contact deduplication, job completion notifications, and smart radius expansion based on user geolocation (May 29, 12:23 PM)
S894 Start the Pharma.uat project and implement auto-save for discovered leads with deduplication (May 29, 12:41 PM)
S895 Start the Pharma.uat project and implement two features: Search/Contacts tab split on Leads page, and bulk draft outreach from Contacts tab (May 29, 12:51 PM)
S896 Remove mock data, wire real template endpoint, fix API crash bug caused by demo auth header (May 29, 12:58 PM)
S897 Pharma Lead Scraper UAT — Search/Save flow fix, responsive layout, and company type filter feature (May 29, 1:05 PM)
3839 1:13p ✅ Pharma App Stack Rebuilt and Deployed via Docker Compose
3840 1:15p 🔵 Buyer-Type Search Returns Leads with saved=false — businessType on Lead Set by Crawler Not Search Query
S898 Pharma Lead Scraper UAT — Scraper crawler bugfix: .html URL variant fallback + correct final URL recording (May 29, 1:15 PM)
3841 1:17p 🔵 Scraper Crawler Architecture: PRIORITY_PATHS, Two-Tier Fetcher, and classify() for businessType
3842 1:20p 🔴 Scraper: _fetch() Now Checks HTTP Status + Returns Final URL After Redirects
3843 " 🔴 Scraper: Crawl Loop Now Uses URL Variant Groups with .html Fallback Per Path
3844 1:21p 🔵 Scraper .html Fallback Verified: dhruvipharma.com/contact.html Crawled Successfully
S899 Pharma Lead Scraper UAT — Contact source attribution, drawer portal fix, source page URL display, and UX polish (May 29, 1:21 PM)
3845 1:24p 🟣 UX Polish: Gold Flash Transition on Save Action in Search Tab
3846 " 🟣 Contact Model: Added source Field to Track Origin of Each Contact (crawl vs google_places)
3847 1:25p 🟣 Contact source Field Propagated Through Scraper and MongoDB Schema
3848 " 🟣 Frontend Contact Type Updated with source Field
3849 " 🟣 LeadDrawer: createPortal Import + prettyUrl() Helper Added
3850 " 🔴 LeadDrawer Render Switched to createPortal — Fixes z-index Stacking Context Issues
3851 " 🟣 LeadDrawer Contact Source Provenance Displayed: Google Places Badge vs Clickable Source Page Link
3852 1:26p 🔴 LeadDrawer createPortal Completed: document.body Added as Portal Target
3853 " 🔴 Drawer Animation Fixed: Slides in from Off-Screen Right Instead of 28px Nudge
3854 " 🟣 CSS: contact-src Styles Added for Provenance Links in Drawer Contact Rows
3855 " ✅ Second Round of UI Polish Deployed: Frontend Build Clean, Stack Rebuilt
3856 1:27p 🔵 Search Job Failed with 503 — Google Places API or Scraper Service Unavailable
3857 " 🔵 Contact Source Attribution Verified Live: google_places vs crawl Correctly Differentiated
S900 Pharma Lead Scraper UAT — Recrawl endpoint, off-domain redirect guard, and full legacy lead refresh (May 29, 1:28 PM)
3858 1:29p 🟣 New API Endpoint: POST /v1/pharma-leads/recrawl — Refresh Existing Leads Without Google Places Discovery
3859 1:30p 🔵 Pre-Fix Leads Confirmed: Old sourceUrls Point Only to Homepage, Not Specific Contact Pages
3860 " 🔵 Recrawl Endpoint Returns 404 — API Container Rebuilt Before Route Was Added
3861 " 🔵 TypeScript Build Error: recrawl seeds Don't Match DiscoveredCompany Type
3862 " 🔴 Recrawl Route TypeScript Fix: companyName Fallback to Empty String
3863 1:31p 🟣 Recrawl Endpoint Live and Working: 5 Jobs Dispatched, 42 Companies Queued for Re-crawl
3864 1:32p 🔵 Recrawl Verified: Contacts Now Show Correct sourceUrls and google_places Attribution — Plus Shantam Redirects to maxwin25link.com
3865 1:33p 🔴 Scraper: Off-Domain Redirect Guard Added — Expired/Parked Domain Contacts Rejected
3866 1:34p 🔴 Off-Domain Redirect Guard Verified: Shantam Now Has Only 1 Contact (Places Seed) — maxwin25link.com Contacts Eliminated
S901 Start the Pharma.uat project — fix broken search loading UX with live progress polling and proper loading states (May 29, 1:34 PM)
3867 1:39p 🔵 Pharma.uat Lead Search Screen Architecture
3868 1:40p 🟣 Job Status Polling API Added to Frontend
3869 " 🟣 Live Search Progress State Added to Leads Component
3870 " 🟣 Real-Time Streaming Lead Results via Job Polling Loop
3871 1:41p 🟣 Animated Spinner Added to Search Button During Active Search
3872 " 🟣 Dual-Mode Search Progress UI: Radar State + Crawl Strip
3873 " 🔵 Existing CSS Animation Infrastructure in index.css
3874 1:42p 🟣 Search Progress CSS Animations Added to index.css
3875 " 🔵 Frontend Build Passes After Search Progress Feature
3876 1:43p ✅ Frontend Deployed via Docker Compose and Verified Live
3877 1:45p 🟣 Staggered Row Fade-In Animation Added to Lead Table
3878 " 🟣 Row Stagger CSS Animation Added to index.css
3879 1:46p ✅ Frontend Rebuilt and Redeployed with Row Stagger Animation
S902 Add staggered row entrance animation to streaming lead results — polish on top of the live search progress feature (May 29, 1:46 PM)
3880 1:48p 🔵 Google Places Discovery Provider Architecture
3881 " 🔵 Google Places Provider: API Call Mechanics and Filtering Logic
3882 1:49p 🟣 Places API Address Components Added for Structured City/State Extraction
3883 " 🔴 City/State Now Sourced from Places Address Components Instead of Search Input
3884 " 🔴 City/State Forwarded Through Full Stack: scraperClient → Python CompanySeed
3885 " 🔵 Crawler.py Uses req.city/req.state Fallback — seed.city/state Not Yet Wired
3886 " 🔴 crawler.py Wired to Use Per-Company seed.city/state Fallback
3887 1:50p 🟣 GPS Radius Banding Extended from 3-Band to 18-Band India Coverage
3888 " ✅ Full Stack Rebuilt and Redeployed After Backend Location Fixes

Access 224k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>