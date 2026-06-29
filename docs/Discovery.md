😂 Fair enough. And honestly, I think you’re right for this type of project.

This isn’t a $5M enterprise transformation. It’s a prove-it project.

Your goal isn’t to produce documentation. Your goal is to answer one question:

Can we get the data out of these systems and build a working dashboard in 2-4 weeks?

That’s a very different mission.

I’d give the agent something much more like this:

Integration Spike - Restaurant Dashboard MVP

Goal

We’re building a reusable dashboard platform for restaurants/catering companies.

The client currently has data spread across multiple operational systems and manually combines it into an Excel dashboard every morning.

The objective is not to replace these systems.

The objective is to automatically pull data from them and display it in a single dashboard.

This is a technical spike, not a production implementation.

⸻

Systems

Retail

* Clover POS

Corporate Delivery

* CaterTrax

Labor

* WhenIWork

Accounting

* QuickBooks

Caterease will be investigated separately.

⸻

Your Mission

Figure out the fastest, lowest-risk way to get data from each system.

Don’t build the dashboard.

Don’t build the backend.

Don’t over-engineer anything.

Just answer:

* Can we connect?
* How?
* What credentials do we need?
* Can we pull yesterday’s data?
* How hard is it?

⸻

For Each System

Spend no more than a few hours investigating.

Find:

1. Authentication

How do we log in?

OAuth?

API Key?

Username/password?

Service account?

⸻

2. API

Does one exist?

Public?

Private?

Documented?

Need vendor approval?

⸻

3. Test It

Can you retrieve:

Yesterday’s sales?

Yesterday’s labor?

Current account balances?

Whatever that system owns.

One successful API call is enough.

⸻

4. Capture

Save:

* Base URL
* Authentication steps
* Sample request
* Sample response
* Required permissions
* Documentation links

⸻

5. Recommendation

Choose ONE:

✅ API

✅ CSV Export

✅ Scheduled Report

✅ Database

❌ Don’t recommend screen scraping unless there’s absolutely no alternative.

⸻

Deliverables

One markdown file per system:

/research/clover.md
/research/catertrax.md
/research/wheniwork.md
/research/quickbooks.md

Each file should answer:

* Can we integrate?
* How?
* Credentials needed
* Sample request
* Sample response
* Estimated implementation effort
* Risks

⸻

MVP Goal

At the end of this spike we should know enough to estimate an MVP.

The MVP is simply:

Daily Sales

Retail (Clover)

Delivery (CaterTrax)

Labor (WhenIWork)

QuickBooks balances

displayed in a web dashboard.

Nothing more.

If we can pull those four data sources automatically, the spike is a success.

Don’t optimize.

Don’t abstract.

Don’t design a framework.

Prove the integrations work first.

I actually think this fits how you’ve been building products.

You’re not trying to create a consulting deliverable—you want enough confidence to tell the client:

“I know how we’re going to connect to your systems. Here’s what the MVP includes, it’ll take about X weeks, and here’s the price.”

Once you’ve proven those integrations, then you can worry about making the platform reusable for the next restaurant client. That’s where the real leverage is.