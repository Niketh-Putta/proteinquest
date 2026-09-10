# Metric definitions

Presentation timezone: Europe/London. Storage: UTC.  
Activation window default: 7 days. Paid window default: 30 days.

| Metric | Formula | Denominator | Incomplete cohorts |
| --- | --- | --- | --- |
| Website visitors | distinct website IDs with `landing_viewed` | consented session IDs | n/a |
| Store clickers | distinct website IDs with `store_link_clicked` | same | clicks can be shown separately |
| Apple downloads | official first-time units | Apple report | redownloads separate |
| Google downloads | official first-time acquisitions | Google report | reinstalls separate |
| First opens | distinct production `install_id` with `first_open` | new installs | none before 2026-09-10 |
| Onboarding completion | completed / started | started installs | event-based only |
| Account creation | `account_created` / eligible onboarding cohort | documented cohort | repeat sign-in excluded |
| First-scan activation | first `meal_logged` within window / new accounts | new accounts | window explicit |
| Scan failure | failed attempts / attempts | attempts, not users | |
| Paywall reach | distinct `paywall_viewed` / cohort | documented cohort | |
| Paid conversion | first verified paid users / cohort | accounts | trials, restores excluded |
| D1/D7/D30 | returned to scan/log on that day / matured cohort | matured first opens | immature excluded |
| Active paid | current entitled paid, not trial | `subscriptions_current` | |
| Churn | expired paid / eligible to renew | interval visible | cancel intent is separate |
| Net proceeds | store proceeds after official fees/tax/refunds | statement currency → GBP | never subtract a fee twice |
| CAC | spend / attributed paying customers | only if both exist | otherwise Unavailable |
