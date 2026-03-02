import { HelmetProvider, Helmet } from "react-helmet-async";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Wand2,
  Settings2,
  ShoppingBag,
  Upload,
  Download,
  Lock,
  Bot,
  Github,
  Shield,
  CreditCard,
  CheckCircle,
  AlertCircle,
  Info,
  ArrowRight,
  FileJson,
  Sparkles,
  User,
} from "lucide-react";
import { Link } from "react-router-dom";

export const GuidancePage = () => {
  return (
    <HelmetProvider>
      <Helmet>
        <title>How to Build n8n Workflows with Claude AI — Studio Guide | DevHubConnect</title>
        <meta
          name="description"
          content="Step-by-step guide: use Claude AI to generate, customize, and download n8n workflow JSON. Learn how to use the Workflow Studio, JSON prompt combos, and import workflows into n8n."
        />
        <link rel="canonical" href="https://www.devhubconnect.com/guidance" />
        <meta property="og:title" content="How to Build n8n Workflows with Claude AI | DevHubConnect" />
        <meta property="og:description" content="Generate and customize n8n workflow JSON using Claude AI. Step-by-step guide to the Workflow Studio and expert JSON prompt combos." />
        <meta property="og:url" content="https://www.devhubconnect.com/guidance" />
        <meta property="og:type" content="article" />
        <meta property="og:image" content="https://www.devhubconnect.com/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="How to Build n8n Workflows with Claude AI | DevHubConnect" />
        <meta name="twitter:description" content="Generate and customize n8n workflow JSON using Claude AI. Step-by-step guide to the Workflow Studio and expert JSON prompt combos." />
        <meta name="twitter:image" content="https://www.devhubconnect.com/og-image.png" />

        {/* HowTo Schema — step-by-step guide surfaced by AI engines */}
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "HowTo",
          "name": "How to Build n8n Workflows with Claude AI",
          "description": "Use DevHubConnect's Workflow Studio to generate, customize, and download n8n automation workflows powered by Claude AI.",
          "url": "https://www.devhubconnect.com/guidance",
          "image": "https://www.devhubconnect.com/og-image.png",
          "totalTime": "PT5M",
          "supply": [
            { "@type": "HowToSupply", "name": "GitHub account (free)" },
            { "@type": "HowToSupply", "name": "DevHubConnect account (free sign-up)" },
            { "@type": "HowToSupply", "name": "n8n instance (self-hosted or cloud)" }
          ],
          "step": [
            {
              "@type": "HowToStep",
              "position": 1,
              "name": "Sign in with GitHub",
              "text": "Go to devhubconnect.com and click 'Sign in with GitHub'. One click — no registration form. The Studio requires a GitHub account and is inaccessible without one.",
              "url": "https://www.devhubconnect.com/auth"
            },
            {
              "@type": "HowToStep",
              "position": 2,
              "name": "Purchase an n8n template or prompt combo",
              "text": "Browse the marketplace and purchase an n8n workflow template ($5–$25) or a JSON + Prompt combo ($15–$49). Templates download immediately as .json files.",
              "url": "https://www.devhubconnect.com/"
            },
            {
              "@type": "HowToStep",
              "position": 3,
              "name": "Open Workflow Studio and upload your JSON",
              "text": "Navigate to the Workflow Studio and upload the DevHubConnect template JSON in the Customize tab. This validates your purchase and unlocks the Build New tab.",
              "url": "https://www.devhubconnect.com/studio"
            },
            {
              "@type": "HowToStep",
              "position": 4,
              "name": "Describe your changes to Claude AI",
              "text": "In the Customize tab chat, describe what you want changed in plain English — for example 'swap Google Sheets for Airtable' or 'add a Slack notification on failure'. Claude returns the complete modified workflow JSON.",
              "url": "https://www.devhubconnect.com/studio"
            },
            {
              "@type": "HowToStep",
              "position": 5,
              "name": "Download and import into n8n",
              "text": "Click the Download button to save the .json file, then open n8n and go to Settings → Import Workflow (or Ctrl+I). Select your file — the workflow loads with all nodes and connections pre-built.",
              "url": "https://www.devhubconnect.com/guidance"
            }
          ]
        })}</script>

        {/* FAQPage Schema — Q&As surfaced in AI and featured snippet responses */}
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "What is DevHubConnect?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "DevHubConnect is an AI-powered n8n workflow marketplace and studio. It provides 500+ ready-to-import n8n workflow JSON templates and an AI studio (powered by Claude) that lets you customize templates, generate new workflows from plain English, and use expert prompt combos."
              }
            },
            {
              "@type": "Question",
              "name": "How do I build an n8n workflow with Claude AI?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Sign in at devhubconnect.com with GitHub, purchase an n8n template, open the Workflow Studio, upload the template JSON, then describe your automation in plain English. Claude returns a complete, importable n8n workflow JSON. Download it and import into n8n via Settings → Import Workflow."
              }
            },
            {
              "@type": "Question",
              "name": "What is a JSON + Prompt combo?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "A combo product includes a starter n8n workflow JSON (downloadable immediately) plus an expert system prompt that unlocks inside the Workflow Studio. The prompt is trained specifically on n8n workflow patterns for a domain like email triage, Slack automation, or data sync."
              }
            },
            {
              "@type": "Question",
              "name": "Do I need to know how to code to use DevHubConnect?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "No. All workflow generation and customization is done through a plain English chat interface. You describe what you want and Claude AI produces the complete n8n workflow JSON. No coding or knowledge of n8n node syntax required."
              }
            },
            {
              "@type": "Question",
              "name": "Why is the Build New tab locked?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "The Build New tab unlocks only after you upload and validate a DevHubConnect template JSON in the Customize tab. This prevents API abuse and ensures AI tools are available only to paying customers. Third-party n8n workflow files are rejected by the validator."
              }
            },
            {
              "@type": "Question",
              "name": "How do I import a workflow into n8n?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Download the workflow JSON from your DevHubConnect dashboard or from the Studio. Open n8n, go to Settings → Import Workflow (or press Ctrl+I), and select the downloaded .json file. The workflow loads with all nodes and connections pre-built. Add your own credentials where placeholder credentials appear."
              }
            },
            {
              "@type": "Question",
              "name": "Is there a daily limit on AI requests?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. There is a limit of 30 AI requests per user per day across the Workflow Studio to prevent abuse. The limit resets at midnight UTC. If you hit the limit, try again the next day."
              }
            },
            {
              "@type": "Question",
              "name": "Do purchased templates require a subscription?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "No. All purchases on DevHubConnect are one-time payments. There is no monthly subscription. Once you purchase a template or prompt combo, it is yours permanently and accessible from your dashboard."
              }
            }
          ]
        })}</script>
      </Helmet>

      <div className="min-h-screen bg-gray-50">
        <Navbar />

        {/* Header */}
        <section className="bg-gradient-to-br from-gray-950 via-teal-950 to-gray-900 text-white py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 bg-teal-500/20 border border-teal-500/30 rounded-full px-4 py-1.5 text-teal-300 text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4" /> Powered by Claude AI
            </div>
            <h1 className="text-4xl font-bold mb-4">How to Use DevHubConnect</h1>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              Your complete guide to the Workflow Studio — purchase n8n templates, customize them with Claude AI,
              and unlock expert prompt combos that generate real working automations.
            </p>
          </div>
        </section>

        {/* Main Content */}
        <section className="py-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">

            {/* Access Requirements — prominent first */}
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
              <p className="text-white font-semibold text-base flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                Two things are required before you can use the Studio
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-800 rounded-xl p-4 flex items-start gap-3">
                  <Github className="w-5 h-5 text-white mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-white font-semibold text-sm">1. GitHub sign-in</p>
                    <p className="text-gray-400 text-xs mt-1">
                      The Studio is <span className="text-yellow-400 font-medium">completely inaccessible</span> without a GitHub account.
                      Clicking "Open Workflow Studio" without being logged in redirects you to the sign-in page.
                      No guest or anonymous access is allowed.
                    </p>
                  </div>
                </div>
                <div className="bg-gray-800 rounded-xl p-4 flex items-start gap-3">
                  <Upload className="w-5 h-5 text-teal-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-white font-semibold text-sm">2. Upload a valid DevHubConnect JSON</p>
                    <p className="text-gray-400 text-xs mt-1">
                      Once logged in, the Studio opens with <span className="text-teal-400 font-medium">Customize</span> and <span className="text-teal-400 font-medium">Prompt Store</span> tabs only.
                      The <strong className="text-white">Build on This</strong> tab stays locked until you upload and validate
                      a JSON template purchased from DevHubConnect. Third-party n8n files are rejected.
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-gray-500 text-xs">
                These restrictions prevent API abuse and ensure the AI tools are only available to paying customers.
              </p>
            </div>

            {/* Quick Start */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-6 h-6 text-green-600" /> Quick Start
                </CardTitle>
                <CardDescription>Get from sign-in to working workflow in 4 steps</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                  {[
                    { num: "1", color: "blue", icon: <Github className="w-5 h-5 text-blue-600" />, title: "Sign In", desc: "Sign in with GitHub — one click, no registration needed." },
                    { num: "2", color: "purple", icon: <CreditCard className="w-5 h-5 text-purple-600" />, title: "Purchase", desc: "Buy an n8n template or a JSON + Prompt combo from the Prompt Store." },
                    { num: "3", color: "teal", icon: <Upload className="w-5 h-5 text-teal-600" />, title: "Upload JSON", desc: "Open Workflow Studio and upload your purchased template to unlock all AI tools." },
                    { num: "4", color: "green", icon: <Wand2 className="w-5 h-5 text-green-600" />, title: "Build & Deploy", desc: "Customize with Claude, build variations, and download your ready-to-import workflow." },
                  ].map(s => (
                    <div key={s.num} className="text-center">
                      <div className={`w-12 h-12 bg-${s.color}-100 rounded-full flex items-center justify-center mx-auto mb-3`}>
                        {s.icon}
                      </div>
                      <h3 className="font-semibold mb-1 text-sm">{s.title}</h3>
                      <p className="text-xs text-gray-500">{s.desc}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Workflow Studio */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wand2 className="w-6 h-6 text-teal-600" /> Workflow Studio
                </CardTitle>
                <CardDescription>
                  The Studio is DevHubConnect's AI workspace — all three tools live here, powered by Claude.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">

                {/* Upload gate */}
                <div className="flex items-start gap-3">
                  <Upload className="w-5 h-5 mt-0.5 text-gray-400 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Start with a JSON upload</h4>
                    <p className="text-gray-600 text-sm">
                      When you first open the Studio you'll see two tabs: <strong>Customize</strong> and <strong>Prompt Store</strong>.
                      Uploading a DevHubConnect template JSON in the Customize tab validates your purchase and unlocks
                      the <strong>Build on This</strong> tab. This keeps AI usage fair for everyone.
                    </p>
                  </div>
                </div>

                {/* Customize */}
                <div className="flex items-start gap-3">
                  <Settings2 className="w-5 h-5 mt-0.5 text-teal-600 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Customize tab — modify your template</h4>
                    <p className="text-gray-600 text-sm">
                      After uploading, the left panel shows your workflow JSON and the right panel is a Claude chat.
                      Describe what you want to change ("swap Google Sheets for Airtable", "add a Slack notification on failure")
                      and Claude returns the complete modified JSON, ready to import into n8n. The panel updates live
                      and the download button always reflects the latest version.
                    </p>
                  </div>
                </div>

                {/* Build on This */}
                <div className="flex items-start gap-3">
                  <Wand2 className="w-5 h-5 mt-0.5 text-emerald-600 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Build on This tab — generate variations</h4>
                    <p className="text-gray-600 text-sm">
                      Unlocked after a valid upload, this tab uses your template's structure as a base.
                      Describe a new variation in plain English and Claude generates a complete, importable
                      n8n workflow JSON. Great for extending an existing automation or creating a related workflow
                      without starting from scratch.
                    </p>
                  </div>
                </div>

                {/* Prompt Store */}
                <div className="flex items-start gap-3">
                  <ShoppingBag className="w-5 h-5 mt-0.5 text-blue-600 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Prompt Store tab — expert AI combos</h4>
                    <p className="text-gray-600 text-sm">
                      Browse and purchase <strong>JSON + Prompt combos</strong>. Each combo includes an importable n8n template
                      <em> and</em> an expert system instruction that makes Claude behave like a domain specialist for that
                      workflow type. The system prompt runs invisibly — you chat with the AI result, not the raw prompt.
                      After purchase you also get a <strong>Starter Prompt</strong> (see below) you can paste directly into Claude.ai or n8n.
                    </p>
                  </div>
                </div>

                <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-sm text-teal-800">
                  <span className="font-semibold flex items-center gap-1 mb-1"><Bot className="w-4 h-4" /> AI model</span>
                  All Studio AI features are powered by <strong>Claude Sonnet</strong> (Anthropic), not Groq or GPT.
                  Claude is the model responsible for generating, modifying, and explaining your n8n workflows.
                </div>
              </CardContent>
            </Card>

            {/* Prompt Combos */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="w-6 h-6 text-gray-700" /> How JSON + Prompt Combos Work
                </CardTitle>
                <CardDescription>What you get, what stays private, and why</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <FileJson className="w-5 h-5 mt-0.5 text-teal-600 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Importable n8n JSON template</h4>
                    <p className="text-gray-600 text-sm">
                      Every combo includes a ready-to-use n8n workflow JSON you can download from your dashboard
                      and import directly into n8n. It serves as the working base for the automation.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 mt-0.5 text-gray-500 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Expert system prompt (invisible)</h4>
                    <p className="text-gray-600 text-sm">
                      The expert prompt is a carefully engineered system instruction sent to Claude as the
                      AI's role definition — it is <em>never displayed</em> to users and is never transferred to your device.
                      It stays server-side so you interact with the AI result, not the raw prompt.
                      This protects the product's IP while giving you a significantly smarter AI assistant for that domain.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Download className="w-5 h-5 mt-0.5 text-teal-600 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Starter Prompt (downloadable, yours to keep)</h4>
                    <p className="text-gray-600 text-sm">
                      This is separate from the hidden system prompt. After purchase, click <strong>"Download Starter Prompt"</strong> in the
                      Studio to get a plain-text prompt you can paste directly into <strong>Claude.ai</strong>, <strong>ChatGPT</strong>, or
                      <strong> n8n's built-in AI assistant</strong> to generate a working workflow — even outside DevHubConnect.
                      Think of it as a bonus portable tool that complements the Studio experience.
                    </p>
                  </div>
                </div>

                <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm text-gray-300">
                  <p className="font-semibold text-white mb-1">Summary: what you get per combo</p>
                  <ul className="space-y-1 text-gray-400">
                    <li>✅ Importable n8n workflow JSON (downloadable)</li>
                    <li>✅ Expert AI assistant in Studio (system prompt active, never shown)</li>
                    <li>✅ Starter Prompt text file (paste into any AI tool)</li>
                    <li>🔒 System prompt source code — private, stays on our servers</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Purchasing */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-6 h-6 text-red-600" /> Purchasing Templates & Combos
                </CardTitle>
                <CardDescription>Secure checkout, same process for both product types</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <Github className="w-5 h-5 mt-0.5 text-gray-500 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Sign in first</h4>
                    <p className="text-gray-600 text-sm">You must be signed in with GitHub to purchase. This links your payment to your account and ensures permanent access.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 mt-0.5 text-gray-500 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Stripe checkout</h4>
                    <p className="text-gray-600 text-sm">
                      Clicking <strong>"Get Combo"</strong> or <strong>"Purchase JSON Template"</strong> routes you through Stripe's
                      secure checkout. Your payment info is never stored on DevHubConnect servers.
                      Both product types use the same Stripe flow.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 mt-0.5 text-gray-500 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Instant access after payment</h4>
                    <p className="text-gray-600 text-sm">
                      Once Stripe confirms payment, your purchase appears in your dashboard immediately.
                      For templates: download the JSON from your dashboard. For combos: activate the prompt
                      in the Studio's Prompt Store tab.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 mt-0.5 text-gray-500 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Duplicate purchase prevention</h4>
                    <p className="text-gray-600 text-sm">The system blocks accidental double-purchases. If you already own an item you'll see an error before reaching Stripe.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* GitHub Auth */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Github className="w-6 h-6" /> GitHub Authentication
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <Github className="w-5 h-5 mt-0.5 text-gray-500 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Sign In with GitHub</h4>
                    <p className="text-gray-600 text-sm">Click "Continue with GitHub" to sign in. Your GitHub account creates your DevHubConnect profile automatically — no password needed.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 mt-0.5 text-gray-500 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">All purchases tied to your GitHub account</h4>
                    <p className="text-gray-600 text-sm">Templates, combos, and Studio access are permanently linked to your GitHub ID — not your email. Always sign in with the same GitHub account you purchased with.</p>
                  </div>
                </div>

                <div className="bg-green-50 p-4 rounded-lg text-sm">
                  <span className="font-semibold text-green-900 flex items-center gap-1 mb-1"><CheckCircle className="w-4 h-4" /> Permanent access</span>
                  <p className="text-green-800">Once purchased, templates and combos stay in your dashboard forever. Access your GitHub account → access your purchases.</p>
                </div>
              </CardContent>
            </Card>

            {/* Dashboard */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-6 h-6 text-indigo-600" /> Your Dashboard
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <Download className="w-5 h-5 mt-0.5 text-gray-500 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Download purchased templates</h4>
                    <p className="text-gray-600 text-sm">Find all your purchased items in the dashboard. Click "Download JSON" to get the workflow file, then import it into n8n via <em>Settings → Import Workflow</em>.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Wand2 className="w-5 h-5 mt-0.5 text-gray-500 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Activate prompt combos in the Studio</h4>
                    <p className="text-gray-600 text-sm">For purchased combos, go to <strong>Workflow Studio → Prompt Store</strong>, find your combo marked "Owned", and click <strong>"Use in Studio"</strong> to activate the expert prompt.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Download className="w-5 h-5 mt-0.5 text-gray-500 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold">Download your Starter Prompt</h4>
                    <p className="text-gray-600 text-sm">Once a prompt combo is active in the Studio, click <strong>"Download Starter Prompt"</strong> at the top of the chat. The .txt file is yours to keep and paste into any AI tool.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Importing into n8n */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileJson className="w-6 h-6 text-orange-500" /> Importing Workflows into n8n
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ol className="space-y-3 text-sm text-gray-700">
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-xs flex items-center justify-center font-bold">1</span>
                    <span>Download the workflow JSON from your DevHubConnect dashboard or from the Studio's download button.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-xs flex items-center justify-center font-bold">2</span>
                    <span>Open n8n and go to <strong>Settings → Import workflow</strong> (or press <kbd className="bg-gray-100 px-1 rounded">Ctrl+I</kbd>).</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-xs flex items-center justify-center font-bold">3</span>
                    <span>Select the downloaded .json file. The workflow loads with all nodes and connections pre-built.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-xs flex items-center justify-center font-bold">4</span>
                    <span>Add your own credentials (API keys, OAuth) where placeholder credentials appear — each node will show a yellow warning until credentials are set.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-xs flex items-center justify-center font-bold">5</span>
                    <span>Run a test execution to verify the workflow works end-to-end before activating it.</span>
                  </li>
                </ol>
              </CardContent>
            </Card>

            {/* Troubleshooting */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="w-6 h-6 text-yellow-600" /> Troubleshooting
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  {
                    icon: <Lock className="w-4 h-4" />,
                    title: "\"Get Combo\" or purchase button does nothing",
                    text: "You must be signed in with GitHub. If you are signed in and still see an error message under the button, read it — it will tell you exactly what went wrong (not logged in, already owned, etc.).",
                  },
                  {
                    icon: <Upload className="w-4 h-4" />,
                    title: "\"Build on This\" tab not showing",
                    text: "Upload a valid DevHubConnect JSON template in the Customize tab first. The tab only appears after a successful validation.",
                  },
                  {
                    icon: <Bot className="w-4 h-4" />,
                    title: "Claude isn't responding in the Studio",
                    text: "There is a daily AI request limit (30 per day) to prevent abuse. If you've hit it, try again tomorrow. If you haven't reached the limit, try refreshing the page.",
                  },
                  {
                    icon: <FileJson className="w-4 h-4" />,
                    title: "Uploaded JSON fails validation",
                    text: "Only templates purchased and downloaded from DevHubConnect.com are accepted. Third-party n8n workflows will not pass the DHC validator.",
                  },
                  {
                    icon: <Github className="w-4 h-4" />,
                    title: "Can't see purchased items in dashboard",
                    text: "Make sure you're signed in with the same GitHub account you used to purchase. Purchases are tied to your GitHub ID, not your email.",
                  },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="mt-0.5 text-gray-400 flex-shrink-0">{item.icon}</span>
                    <div>
                      <h4 className="font-semibold text-sm">{item.title}</h4>
                      <p className="text-gray-600 text-sm">{item.text}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* CTA */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="w-6 h-6 text-blue-600" /> Need More Help?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 text-sm mb-5">
                  If you're still stuck, email us at{" "}
                  <a href="mailto:devhub.partners@gmail.com" className="text-teal-600 underline">devhub.partners@gmail.com</a>.
                  Include your GitHub username and a description of the issue.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link to="/studio">
                    <Button>
                      <Wand2 className="w-4 h-4 mr-2" /> Open Workflow Studio
                    </Button>
                  </Link>
                  <Link to="/auth">
                    <Button variant="outline">
                      <Github className="w-4 h-4 mr-2" /> Sign In with GitHub
                    </Button>
                  </Link>
                  <Link to="/dashboard">
                    <Button variant="outline">
                      <ArrowRight className="w-4 h-4 mr-2" /> My Dashboard
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

          </div>
        </section>
      </div>
    </HelmetProvider>
  );
};
