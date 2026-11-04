import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Video, Shield, Users, Zap, Check, ChevronDown, UserCircle, Building2, Building, GraduationCap, PlusCircle, Mic, LayoutGrid, Cpu, LayoutDashboard, Workflow, Briefcase, Tag, X, Star, Lock, Globe, Headphones, Download, LogIn } from "lucide-react";
import JoinMeetingModal from "@/components/JoinMeetingModal";
import tancomLogo from "@assets/TanCom_Logo_1780923314837.jpeg";
import alexChen   from "@assets/participants/alex-chen.png";
import jamiePark  from "@assets/participants/jamie-park.png";
import samRivera  from "@assets/participants/sam-rivera.png";
import taylorWong from "@assets/participants/taylor-wong.png";
import morganLee  from "@assets/participants/morgan-lee.png";
import chrisKim   from "@assets/participants/chris-kim.png";

const productGroups = [
  {
    heading: "ConnectHub",
    items: [
      { label: "ConnectHub for Individuals",          icon: UserCircle,     desc: "Personal video calls & meetings" },
      { label: "ConnectHub for Growing Businesses",   icon: Building2,      desc: "Collaboration tools for teams" },
      { label: "ConnectHub for Enterprises",          icon: Building,       desc: "Enterprise-grade security & scale" },
      { label: "ConnectHub for Learning Institutions",icon: GraduationCap,  desc: "Virtual classrooms & webinars" },
    ],
  },
  {
    heading: "Extensions & Services",
    items: [
      { label: "ConnectHub Plus",           icon: PlusCircle,    desc: "Premium features & storage" },
      { label: "ConnectHub Voice",          icon: Mic,           desc: "Cloud telephony & VoIP" },
      { label: "ConnectHub Meeting Spaces", icon: LayoutGrid,    desc: "Hardware-integrated rooms" },
      { label: "ConnectHub Smart Devices",  icon: Cpu,           desc: "IoT-enabled conference rooms" },
    ],
  },
  {
    heading: "Integrated Solutions",
    items: [
      { label: "Smart Workspace Manager",     icon: LayoutDashboard, desc: "Unified workspace analytics" },
      { label: "Workflow & Process Automation", icon: Workflow,      desc: "Automate meeting workflows" },
    ],
  },
];

const pricingItems = [
  { label: "Business",    icon: Briefcase,   desc: "Flexible plans for growing teams" },
  { label: "Individuals", icon: UserCircle,  desc: "Simple, affordable personal plans" },
  { label: "Enterprise",  icon: Building,    desc: "Custom pricing for large organizations" },
];

const participants = [
  { name: "Alex Chen",    photo: alexChen,   host: true  },
  { name: "Jamie Park",  photo: jamiePark,  host: false },
  { name: "Sam Rivera",  photo: samRivera,  host: false },
  { name: "Taylor Wong", photo: taylorWong, host: false },
  { name: "Morgan Lee",  photo: morganLee,  host: false },
  { name: "Chris Kim",   photo: chrisKim,   host: false },
];

const features = [
  { icon: Video,  title: "HD Video Meetings",  description: "Crystal clear video conferences with up to hundreds of participants." },
  { icon: Shield, title: "Secure & Private",   description: "End-to-end encryption, waiting rooms, and passcode protection." },
  { icon: Zap,    title: "Instant Meetings",   description: "Start a meeting in seconds with one-click join links." },
  { icon: Users,  title: "Host Controls",      description: "Mute, remove, and manage participants with full host controls." },
];

const highlights = [
  "No time limits on meetings",
  "Screen sharing & chat",
  "Meeting recordings",
  "Waiting room management",
  "Contacts & scheduling",
  "Admin analytics dashboard",
];

export default function LandingPage() {
  const [productsOpen, setProductsOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [businessModalOpen, setBusinessModalOpen] = useState(false);
  const [enterpriseModalOpen, setEnterpriseModalOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pricingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProductsOpen(false);
      }
    }
    if (productsOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [productsOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pricingRef.current && !pricingRef.current.contains(e.target as Node)) {
        setPricingOpen(false);
      }
    }
    if (pricingOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pricingOpen]);

  return (
    <div className="min-h-screen bg-white">
      <JoinMeetingModal open={joinModalOpen} onClose={() => setJoinModalOpen(false)} />

      {/* Nav */}
      <header className="border-b border-gray-100 relative z-50">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          {/* Left: logo + Products */}
          <div className="flex items-center gap-6">
            <div className="flex items-center">
              <img src={tancomLogo} alt="TanCom.US" className="h-14 w-auto object-contain" />
            </div>

            {/* Products dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setProductsOpen((o) => !o)}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors px-2 py-1.5 rounded-md hover:bg-gray-50"
              >
                Products
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${productsOpen ? "rotate-180" : ""}`} />
              </button>

              {productsOpen && (
                <div className="absolute left-0 top-full mt-2 w-[640px] rounded-2xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5 overflow-hidden">
                  <div className="grid grid-cols-3 divide-x divide-gray-100">
                    {productGroups.map((group) => (
                      <div key={group.heading} className="p-5">
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                          {group.heading}
                        </p>
                        <ul className="space-y-1">
                          {group.items.map((item) => {
                            const Icon = item.icon;
                            return (
                              <li key={item.label}>
                                <button
                                  onClick={() => setProductsOpen(false)}
                                  className="w-full flex items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-blue-50 group transition-colors"
                                >
                                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-100 group-hover:bg-blue-200 transition-colors">
                                    <Icon className="h-3.5 w-3.5 text-blue-600" />
                                  </span>
                                  <span>
                                    <span className="block text-xs font-semibold text-gray-800 group-hover:text-blue-700 leading-tight">
                                      {item.label}
                                    </span>
                                    <span className="block text-[11px] text-gray-500 mt-0.5 leading-tight">
                                      {item.desc}
                                    </span>
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>

                  {/* Footer strip */}
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-3 flex items-center justify-between">
                    <span className="text-xs text-gray-500">Not sure which plan fits? We can help.</span>
                    <Link href="/sign-up">
                      <button
                        onClick={() => setProductsOpen(false)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                      >
                        Get started free →
                      </button>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Smart Pricing dropdown */}
            <div className="relative" ref={pricingRef}>
              <button
                onClick={() => setPricingOpen((o) => !o)}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors px-2 py-1.5 rounded-md hover:bg-gray-50"
              >
                Smart Pricing
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${pricingOpen ? "rotate-180" : ""}`} />
              </button>

              {pricingOpen && (
                <div className="absolute left-0 top-full mt-2 w-72 rounded-2xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5 overflow-hidden">
                  <div className="p-5">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                      Pricing Plans
                    </p>
                    <ul className="space-y-1">
                      {pricingItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <li key={item.label}>
                            <button
                              onClick={() => {
                                setPricingOpen(false);
                                if (item.label === "Business") setBusinessModalOpen(true);
                                if (item.label === "Enterprise") setEnterpriseModalOpen(true);
                              }}
                              className="w-full flex items-start gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-blue-50 group transition-colors"
                            >
                              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-100 group-hover:bg-blue-200 transition-colors">
                                <Icon className="h-3.5 w-3.5 text-blue-600" />
                              </span>
                              <span>
                                <span className="block text-xs font-semibold text-gray-800 group-hover:text-blue-700 leading-tight">
                                  {item.label}
                                </span>
                                <span className="block text-[11px] text-gray-500 mt-0.5 leading-tight">
                                  {item.desc}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  {/* Footer strip */}
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-3 flex items-center justify-between">
                    <span className="text-xs text-gray-500">Need a custom quote?</span>
                    <Link href="/sign-up">
                      <button
                        onClick={() => setPricingOpen(false)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                      >
                        Contact sales →
                      </button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Join + Download + auth */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-gray-700"
              onClick={() => setJoinModalOpen(true)}
            >
              <LogIn className="h-4 w-4" />
              Join a Meeting
            </Button>
            <Link href="/download">
              <Button variant="ghost" size="sm" className="gap-1.5 text-gray-700">
                <Download className="h-4 w-4" />
                Download
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm">Get started free</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-6 pt-20 pb-16 text-center">
        <Badge className="mb-6 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50">
          Video conferencing, reimagined
        </Badge>
        <h1 className="text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl">
          Connect with your team{" "}
          <span className="text-blue-600">anywhere</span>
        </h1>
        <p className="mt-6 text-xl text-gray-600 max-w-2xl mx-auto">
          TanCom brings seamless video meetings to your browser. Host instant calls, schedule
          meetings, manage recordings, and collaborate with your contacts — all in one place.
        </p>
        <div className="mt-10 flex flex-wrap gap-4 justify-center">
          <Link href="/sign-up">
            <Button size="lg" className="gap-2 px-8">
              <Video className="h-5 w-5" />
              Start for free
            </Button>
          </Link>
          <Button
            size="lg"
            variant="outline"
            className="gap-2 px-8"
            onClick={() => setJoinModalOpen(true)}
          >
            <LogIn className="h-5 w-5" />
            Join a Meeting
          </Button>
          <Link href="/sign-in">
            <Button size="lg" variant="ghost" className="px-8 text-gray-600">
              Sign in
            </Button>
          </Link>
        </div>

        {/* Mock browser window */}
        <div className="mt-16 rounded-2xl border border-gray-200 bg-gray-50 p-3 shadow-2xl max-w-4xl mx-auto">
          <div className="rounded-xl bg-gray-900 overflow-hidden">
            <div className="bg-gray-800 px-4 py-3 flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              <div className="h-3 w-3 rounded-full bg-yellow-500" />
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <div className="ml-4 flex-1 bg-gray-700 rounded h-6 flex items-center px-3">
                <span className="text-gray-400 text-xs">tancom.app/room/Q1-PLANNING</span>
              </div>
            </div>
            <div className="bg-gray-900 p-4 grid grid-cols-3 gap-3 aspect-video">
              {participants.map((p) => (
                <div key={p.name} className="relative rounded-lg overflow-hidden bg-gray-800">
                  <img
                    src={p.photo}
                    alt={p.name}
                    className="w-full h-full object-cover object-top"
                    draggable={false}
                  />
                  {/* subtle dark gradient at bottom for readability */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 flex items-center justify-between">
                    <span className="text-white text-[11px] font-medium truncate drop-shadow">{p.name}</span>
                    {p.host && (
                      <span className="text-[9px] font-semibold bg-blue-600 text-white px-1.5 py-0.5 rounded-full ml-1 shrink-0">
                        Host
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-gray-800 px-6 py-3 flex items-center justify-center gap-4">
              {[
                { color: "bg-gray-700", label: "Mic" },
                { color: "bg-gray-700", label: "Video" },
                { color: "bg-gray-700", label: "Share" },
                { color: "bg-red-600",  label: "End" },
              ].map((b) => (
                <div key={b.label} className={`${b.color} rounded-full px-4 py-1.5 text-xs text-white font-medium`}>
                  {b.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 py-20">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Everything you need to run great meetings
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="bg-white rounded-2xl p-6 border border-gray-200">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 mb-4">
                    <Icon className="h-5 w-5 text-blue-600" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-2">{f.title}</h3>
                  <p className="text-sm text-gray-600">{f.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Highlights */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-6 flex flex-col lg:flex-row gap-12 items-center">
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">
              Built for teams of all sizes
            </h2>
            <p className="text-gray-600 mb-8">
              Whether you're running a quick standup or a company-wide all-hands,
              TanCom scales with your needs.
            </p>
            <ul className="space-y-3">
              {highlights.map((h) => (
                <li key={h} className="flex items-center gap-3 text-gray-700">
                  <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                  {h}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Link href="/sign-up">
                <Button size="lg">Start for free</Button>
              </Link>
            </div>
          </div>
          <div className="flex-1 bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-8 text-white">
            <div className="space-y-4">
              {[
                { label: "Meetings hosted", value: "12,400+" },
                { label: "Active users",    value: "3,200+"  },
                { label: "Hours of calls",  value: "48,000+" },
                { label: "Uptime",          value: "99.9%"   },
              ].map((stat) => (
                <div key={stat.label} className="flex justify-between items-center border-b border-white/20 pb-4">
                  <span className="text-blue-100 text-sm">{stat.label}</span>
                  <span className="text-2xl font-bold">{stat.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="mx-auto max-w-7xl px-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <img src={tancomLogo} alt="TanCom.US" className="h-10 w-auto object-contain" />
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
            <a href="/privacy-policy" className="text-sm text-gray-500 hover:text-blue-600 transition-colors">Privacy Policy</a>
            <a href="/terms-of-service" className="text-sm text-gray-500 hover:text-blue-600 transition-colors">Terms of Service</a>
            <a href="/cookie-policy" className="text-sm text-gray-500 hover:text-blue-600 transition-colors">Cookie Policy</a>
            <a href="/user-manual" className="text-sm text-gray-500 hover:text-blue-600 transition-colors">Help &amp; Support</a>
            <a href="mailto:support@tancom.us" className="text-sm text-gray-500 hover:text-blue-600 transition-colors">Contact Us</a>
          </nav>
          <span className="text-sm text-gray-400">© {new Date().getFullYear()} TanCom.US. All rights reserved.</span>
        </div>
      </footer>

      {/* Enterprise plan modal */}
      {enterpriseModalOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setEnterpriseModalOpen(false); }}
        >
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-gray-900 to-gray-700 rounded-t-2xl px-8 py-6 text-white">
              <button
                onClick={() => setEnterpriseModalOpen(false)}
                className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2 mb-2">
                <Building className="h-4 w-4 text-gray-300" />
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Enterprise</span>
              </div>
              <h2 className="text-2xl font-bold leading-tight">TanCom.US Enterprise</h2>
              <p className="mt-2 text-gray-300 text-sm leading-relaxed max-w-xl">
                Enterprise communications and collaboration infrastructure designed for organizations operating at scale.
              </p>
              <div className="mt-4 flex items-end gap-3">
                <div>
                  <span className="text-lg font-bold text-white">Custom Enterprise Pricing</span>
                  <p className="text-xs text-gray-400 mt-0.5">Tailored to your organization's size and needs</p>
                </div>
              </div>
              <button
                onClick={() => setEnterpriseModalOpen(false)}
                className="mt-4 inline-flex items-center gap-2 bg-white text-gray-900 text-sm font-semibold px-5 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Headphones className="h-3.5 w-3.5" /> Contact Sales
              </button>
            </div>

            {/* Body */}
            <div className="px-8 py-6 space-y-7">

              {/* Large-Scale Meetings */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-100">
                    <Video className="h-3.5 w-3.5 text-blue-600" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">Large-Scale Enterprise Meetings</h3>
                </div>
                <ul className="space-y-2">
                  {[
                    "Up to 1,000 participants per meeting",
                    "Enterprise event scalability and performance optimization",
                    "Advanced communication management for global teams",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
              </section>

              <hr className="border-gray-100" />

              {/* Cloud Phone */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-100">
                    <Mic className="h-3.5 w-3.5 text-indigo-600" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">Unified Cloud Phone System</h3>
                </div>
                <ul className="space-y-2">
                  {[
                    "Full-featured business phone solution",
                    "Enterprise call management capabilities",
                    "Integrated voice and collaboration environment",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
              </section>

              <hr className="border-gray-100" />

              {/* Webinars */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-100">
                    <Users className="h-3.5 w-3.5 text-purple-600" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">Enterprise Webinars &amp; Virtual Events</h3>
                </div>
                <ul className="space-y-2">
                  {[
                    "Host webinars for up to 500 attendees",
                    "Professional event engagement and presentation tools",
                    "Large-scale virtual communication support",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
              </section>

              <hr className="border-gray-100" />

              {/* Smart Workplace */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-green-100">
                    <LayoutDashboard className="h-3.5 w-3.5 text-green-600" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">Smart Workplace Management</h3>
                </div>
                <ul className="space-y-2">
                  {[
                    "Workspace and room reservation tools",
                    "Visitor and facility management capabilities",
                    "Optimized hybrid workplace coordination",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
              </section>

              <hr className="border-gray-100" />

              {/* Global Communication */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-100">
                    <Globe className="h-3.5 w-3.5 text-cyan-600" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">Global Communication Features</h3>
                </div>
                <ul className="space-y-2">
                  {[
                    "Real-time translated captions",
                    "Enhanced accessibility and multilingual collaboration",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="h-4 w-4 text-cyan-500 mt-0.5 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
              </section>

              <hr className="border-gray-100" />

              {/* Advanced Enterprise */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-red-100">
                    <Lock className="h-3.5 w-3.5 text-red-600" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">Advanced Enterprise Options</h3>
                </div>
                <ul className="space-y-2">
                  {[
                    "Customer-controlled encryption key support",
                    "Hybrid cloud deployment capabilities",
                    "Enterprise infrastructure flexibility and governance controls",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
              </section>

              <hr className="border-gray-100" />

              {/* Designed For */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-100">
                    <Building2 className="h-3.5 w-3.5 text-orange-600" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">Designed For</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Enterprise organizations",
                    "National and global operations",
                    "Government agencies and contractors",
                    "Regulated industries",
                    "Large-scale hybrid work environments",
                  ].map((tag) => (
                    <span key={tag} className="inline-block rounded-full bg-orange-50 border border-orange-200 px-3 py-1 text-xs font-medium text-orange-700">
                      {tag}
                    </span>
                  ))}
                </div>
              </section>

              <hr className="border-gray-100" />

              {/* Why TanCom Enterprise */}
              <section className="bg-gray-50 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-gray-700" />
                  <h3 className="text-sm font-bold text-gray-900">Why TanCom.US Enterprise</h3>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">
                  TanCom.US Enterprise provides secure, scalable, and intelligent communications infrastructure engineered to support mission-critical collaboration, operational efficiency, and enterprise-level governance.
                </p>
              </section>

              {/* CTA */}
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <button
                  onClick={() => setEnterpriseModalOpen(false)}
                  className="flex-1 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold px-5 py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Headphones className="h-4 w-4" /> Contact Sales
                </button>
                <Link href="/sign-up" className="flex-1">
                  <button
                    onClick={() => setEnterpriseModalOpen(false)}
                    className="w-full border border-gray-300 hover:border-gray-400 text-gray-700 text-sm font-semibold px-5 py-3 rounded-lg transition-colors"
                  >
                    Start with Business first
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Business / Professional Enterprise plan modal */}
      {businessModalOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setBusinessModalOpen(false); }}
        >
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-blue-700 to-blue-500 rounded-t-2xl px-8 py-6 text-white">
              <button
                onClick={() => setBusinessModalOpen(false)}
                className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2 mb-2">
                <Star className="h-4 w-4 text-yellow-300 fill-yellow-300" />
                <span className="text-xs font-semibold uppercase tracking-widest text-blue-100">Professional Enterprise</span>
              </div>
              <h2 className="text-2xl font-bold leading-tight">TanCom.US Professional Enterprise</h2>
              <p className="mt-2 text-blue-100 text-sm leading-relaxed max-w-xl">
                Built for modern organizations that require secure, scalable, and intelligent business communications.
              </p>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-4xl font-extrabold">$12</span>
                <div className="pb-1">
                  <span className="text-blue-100 text-sm font-medium">/month</span>
                  <p className="text-[11px] text-yellow-200 font-medium">Special pricing available for IPO owners.</p>
                </div>
              </div>
              <p className="text-[11px] text-blue-200 mt-1">per user/month — billed annually</p>
              <Link href="/sign-up">
                <button
                  onClick={() => setBusinessModalOpen(false)}
                  className="mt-4 inline-block bg-white text-blue-700 text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  Get started free →
                </button>
              </Link>
            </div>

            {/* Body */}
            <div className="px-8 py-6 space-y-7">

              {/* Section: Enterprise Video */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-100">
                    <Video className="h-3.5 w-3.5 text-blue-600" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">Enterprise Video Collaboration</h3>
                </div>
                <ul className="space-y-2">
                  {[
                    "Host meetings up to 30 hours",
                    "Support for 100 interactive participants",
                    "Expand attendee capacity with advanced event scaling options",
                    "High-definition video and audio conferencing",
                    "Real-time screen sharing and presentation controls",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </section>

              <hr className="border-gray-100" />

              {/* Section: AI */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-100">
                    <Zap className="h-3.5 w-3.5 text-purple-600" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">AI-Powered Productivity Suite</h3>
                </div>
                <ul className="space-y-2">
                  {[
                    "Unlimited in-meeting AI assistance",
                    "Smart meeting summaries and action tracking",
                    "AI-enhanced collaboration tools across workspace applications",
                    "Browser and desktop workspace access",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </section>

              <hr className="border-gray-100" />

              {/* Section: Unified Comms */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-green-100">
                    <Globe className="h-3.5 w-3.5 text-green-600" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">Unified Business Communications</h3>
                </div>
                <ul className="space-y-2">
                  {[
                    "Team chat and persistent messaging",
                    "Cross-device collaboration",
                    "Secure file and content sharing",
                    "Centralized communication workspace for distributed teams",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </section>

              <hr className="border-gray-100" />

              {/* Section: Security */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-red-100">
                    <Lock className="h-3.5 w-3.5 text-red-600" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">Security &amp; Administration</h3>
                </div>
                <ul className="space-y-2">
                  {[
                    "Enterprise-grade account management",
                    "Administrative controls and user management",
                    "Secure encrypted communications",
                    "Role-based access configuration",
                    "Cloud-managed collaboration environment",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </section>

              <hr className="border-gray-100" />

              {/* Section: Designed For */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-100">
                    <Users className="h-3.5 w-3.5 text-orange-600" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">Designed For</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Growing enterprises",
                    "Hybrid and remote workforces",
                    "Professional services organizations",
                    "Government contractors",
                    "Multi-location business operations",
                  ].map((tag) => (
                    <span key={tag} className="inline-block rounded-full bg-orange-50 border border-orange-200 px-3 py-1 text-xs font-medium text-orange-700">
                      {tag}
                    </span>
                  ))}
                </div>
              </section>

              <hr className="border-gray-100" />

              {/* Why TanCom */}
              <section className="bg-blue-50 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Headphones className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-gray-900">Why TanCom.US</h3>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">
                  TanCom.US delivers professional-grade collaboration technology with the flexibility, reliability, and administrative control required by today's business environments. Built to support productivity at scale while maintaining a streamlined user experience.
                </p>
              </section>

              {/* CTA */}
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <Link href="/sign-up" className="flex-1">
                  <button
                    onClick={() => setBusinessModalOpen(false)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-3 rounded-lg transition-colors"
                  >
                    Get started free
                  </button>
                </Link>
                <button
                  onClick={() => setBusinessModalOpen(false)}
                  className="flex-1 border border-gray-300 hover:border-gray-400 text-gray-700 text-sm font-semibold px-5 py-3 rounded-lg transition-colors"
                >
                  Contact sales
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
