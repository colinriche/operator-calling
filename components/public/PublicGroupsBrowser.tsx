"use client";

import { useState, useEffect, useRef } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Search,
  ChevronRight,
  ChevronLeft,
  Users,
  MapPin,
  Globe,
  X,
  Loader2,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// ─── Hierarchy ────────────────────────────────────────────────────────────────

interface Division   { id: string; label: string }
interface Subcategory { id: string; label: string; divisions: Division[] }
interface Category   { id: string; label: string; emoji: string; description: string; color: string; subcategories: Subcategory[] }

const HIERARCHY: Category[] = [
  {
    id: "sport", label: "Sport", emoji: "🏆",
    description: "Sports clubs, teams, and leagues",
    color: "bg-orange-50 border-orange-200 hover:border-orange-400",
    subcategories: [
      { id: "football",   label: "Football",            divisions: [{ id: "local", label: "Local" }, { id: "national", label: "National" }, { id: "teams", label: "Teams & Clubs" }] },
      { id: "basketball", label: "Basketball",          divisions: [{ id: "local", label: "Local" }, { id: "national", label: "National" }, { id: "teams", label: "Teams & Clubs" }] },
      { id: "rugby",      label: "Rugby",               divisions: [{ id: "local", label: "Local" }, { id: "national", label: "National" }, { id: "teams", label: "Teams & Clubs" }] },
      { id: "cricket",    label: "Cricket",             divisions: [{ id: "local", label: "Local" }, { id: "national", label: "National" }, { id: "teams", label: "Clubs" }] },
      { id: "tennis",     label: "Tennis",              divisions: [{ id: "local", label: "Local" }, { id: "teams", label: "Clubs" }] },
      { id: "golf",       label: "Golf",                divisions: [{ id: "local", label: "Local" }, { id: "teams", label: "Clubs" }] },
      { id: "swimming",   label: "Swimming",            divisions: [{ id: "local", label: "Local" }, { id: "teams", label: "Clubs" }] },
      { id: "athletics",  label: "Athletics",           divisions: [{ id: "local", label: "Local" }, { id: "national", label: "National" }, { id: "teams", label: "Clubs" }] },
      { id: "cycling",    label: "Cycling",             divisions: [{ id: "local", label: "Local" }, { id: "teams", label: "Clubs" }] },
      { id: "boxing",     label: "Boxing & Martial Arts", divisions: [{ id: "local", label: "Local" }, { id: "teams", label: "Gyms & Clubs" }] },
    ],
  },
  {
    id: "social", label: "Social", emoji: "🤝",
    description: "Social clubs and hobby groups",
    color: "bg-pink-50 border-pink-200 hover:border-pink-400",
    subcategories: [
      { id: "book_clubs", label: "Book Clubs",       divisions: [{ id: "local", label: "Local" }, { id: "general", label: "General" }] },
      { id: "gaming",     label: "Gaming",           divisions: [{ id: "casual", label: "Casual" }, { id: "competitive", label: "Competitive" }] },
      { id: "music",      label: "Music",            divisions: [{ id: "local", label: "Local" }, { id: "general", label: "General" }] },
      { id: "film_tv",    label: "Film & TV",        divisions: [{ id: "general", label: "General" }] },
      { id: "art",        label: "Art & Photography", divisions: [{ id: "local", label: "Local" }, { id: "general", label: "General" }] },
      { id: "food_drink", label: "Food & Drink",     divisions: [{ id: "local", label: "Local" }, { id: "general", label: "General" }] },
    ],
  },
  {
    id: "education", label: "Education", emoji: "📚",
    description: "Learning groups and study communities",
    color: "bg-blue-50 border-blue-200 hover:border-blue-400",
    subcategories: [
      { id: "language",     label: "Language Learning",      divisions: [{ id: "general", label: "General" }] },
      { id: "university",   label: "University",             divisions: [{ id: "local", label: "Local" }, { id: "national", label: "National" }] },
      { id: "professional", label: "Professional Development", divisions: [{ id: "general", label: "General" }] },
      { id: "schools",      label: "Schools",                divisions: [{ id: "local", label: "Local" }] },
    ],
  },
  {
    id: "work", label: "Work", emoji: "💼",
    description: "Professional communities and work groups",
    color: "bg-purple-50 border-purple-200 hover:border-purple-400",
    subcategories: [
      { id: "tech",       label: "Tech",       divisions: [{ id: "local", label: "Local" }, { id: "general", label: "General" }] },
      { id: "finance",    label: "Finance",    divisions: [{ id: "general", label: "General" }] },
      { id: "healthcare", label: "Healthcare", divisions: [{ id: "local", label: "Local" }, { id: "general", label: "General" }] },
      { id: "creative",   label: "Creative",   divisions: [{ id: "local", label: "Local" }, { id: "general", label: "General" }] },
    ],
  },
  {
    id: "community", label: "Community", emoji: "🏘️",
    description: "Local community and neighbourhood groups",
    color: "bg-green-50 border-green-200 hover:border-green-400",
    subcategories: [
      { id: "neighbourhood", label: "Neighbourhood",      divisions: [{ id: "local", label: "Local" }] },
      { id: "volunteering",  label: "Volunteering",       divisions: [{ id: "local", label: "Local" }, { id: "national", label: "National" }] },
      { id: "faith",         label: "Faith & Spirituality", divisions: [{ id: "local", label: "Local" }, { id: "general", label: "General" }] },
      { id: "environment",   label: "Environment",        divisions: [{ id: "local", label: "Local" }, { id: "national", label: "National" }] },
    ],
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublicGroup {
  id: string;
  name: string;
  description?: string;
  type?: string;
  category?: string;
  subcategory?: string;
  subSubcategory?: string;
  city?: string;
  country?: string;
  isPrivate?: boolean;
  memberIds?: string[];
  interests?: string[];
  tags?: string[];
}

// ─── Interest validation ──────────────────────────────────────────────────────

const INTEREST_MAX_LENGTH = 30;
const INTEREST_RE = /^[A-Za-z ]+$/;

function sanitizeInterest(raw: string): string {
  return raw.replace(/[^A-Za-z ]/g, "").slice(0, INTEREST_MAX_LENGTH).trim();
}

function isValidInterest(s: string): boolean {
  return s.length >= 2 && s.length <= INTEREST_MAX_LENGTH && INTEREST_RE.test(s);
}

// ─── Match helpers ────────────────────────────────────────────────────────────

function matchesCategory(g: PublicGroup, catId: string) {
  return g.type === catId || g.category === catId;
}
function matchesSubcategory(g: PublicGroup, subId: string) {
  return g.subcategory === subId;
}
function matchesDivision(g: PublicGroup, divId: string) {
  return g.subSubcategory === divId;
}

/** True if any selected interest appears in the group's interests or tags. */
function matchesInterests(g: PublicGroup, selected: string[]): boolean {
  if (selected.length === 0) return true;
  const haystack = [
    ...(g.interests ?? []),
    ...(g.tags ?? []),
    g.name,
    g.description ?? "",
  ].map((s) => s.toLowerCase());
  return selected.some((i) => haystack.some((h) => h.includes(i.toLowerCase())));
}

/** Full-text search: name, description, interests, tags. */
function matchesSearch(g: PublicGroup, q: string): boolean {
  const lower = q.toLowerCase();
  return (
    g.name.toLowerCase().includes(lower) ||
    (g.description?.toLowerCase().includes(lower) ?? false) ||
    (g.interests?.some((i) => i.toLowerCase().includes(lower)) ?? false) ||
    (g.tags?.some((t) => t.toLowerCase().includes(lower)) ?? false)
  );
}

// ─── GroupCard ────────────────────────────────────────────────────────────────

function GroupCard({ group }: { group: PublicGroup }) {
  const count = group.memberIds?.length ?? 0;
  const location = [group.city, group.country].filter(Boolean).join(", ");
  const chips = [...(group.interests ?? []), ...(group.tags ?? [])].slice(0, 4);

  return (
    <div className="bg-card rounded-2xl p-5 border border-border/60 hover:border-primary/30 transition-colors flex items-start gap-4">
      <div className="w-11 h-11 rounded-full gradient-gold flex items-center justify-center text-primary-foreground font-heading font-bold text-lg shrink-0">
        {group.name[0]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground truncate">{group.name}</p>
        {group.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{group.description}</p>
        )}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {chips.map((chip) => (
              <span key={chip} className="text-xs px-2 py-0.5 rounded-full bg-primary/8 text-primary font-medium">
                {chip}
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="w-3 h-3" />{count} {count === 1 ? "member" : "members"}
          </span>
          {location && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3" />{location}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Globe className="w-3 h-3" />Public
          </span>
        </div>
      </div>
      <Link
        href="/signup"
        className={cn(buttonVariants({ size: "sm" }), "gradient-gold border-0 text-primary-foreground font-semibold shrink-0")}
      >
        Join
      </Link>
    </div>
  );
}

// ─── NavCard ──────────────────────────────────────────────────────────────────

function NavCard({ label, emoji, description, count, color, onClick }: {
  label: string; emoji?: string; description?: string; count?: number; color?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-2xl p-5 border transition-all hover:shadow-sm group",
        color ?? "bg-card border-border/60 hover:border-primary/30"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {emoji && <div className="text-3xl mb-2">{emoji}</div>}
          <p className="font-semibold text-foreground group-hover:text-primary transition-colors">{label}</p>
          {description && <p className="text-xs text-muted-foreground mt-1 leading-snug">{description}</p>}
          {count !== undefined && (
            <p className="text-xs text-muted-foreground mt-1">{count} {count === 1 ? "group" : "groups"}</p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
      </div>
    </button>
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb({ items }: { items: { label: string; onClick: () => void; active: boolean }[] }) {
  if (items.length <= 1) return null;
  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-6 flex-wrap">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
          <button
            onClick={item.onClick}
            disabled={item.active}
            className={cn("transition-colors", item.active ? "text-foreground font-medium cursor-default" : "hover:text-foreground hover:underline")}
          >
            {item.label}
          </button>
        </span>
      ))}
    </nav>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ searchQuery }: { searchQuery?: string }) {
  return (
    <div className="text-center py-16 px-4">
      <div className="text-5xl mb-4">🔍</div>
      <h3 className="font-heading font-semibold text-lg text-foreground mb-2">
        {searchQuery ? `No groups found for "${searchQuery}"` : "No groups here yet"}
      </h3>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto mb-6">
        {searchQuery
          ? "Try a different search term, clear some filters, or browse by category."
          : "Be the first to create a group in this category."}
      </p>
      <Link href="/signup" className={cn(buttonVariants(), "gradient-gold border-0 text-primary-foreground font-semibold")}>
        Create a group
      </Link>
    </div>
  );
}

// ─── Interests picker ─────────────────────────────────────────────────────────

function InterestsPicker({
  popular,
  selected,
  onToggle,
  onAdd,
}: {
  popular: string[];
  selected: string[];
  onToggle: (interest: string) => void;
  onAdd: (interest: string) => void;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleInput(raw: string) {
    const cleaned = raw.replace(/[^A-Za-z ]/g, "").slice(0, INTEREST_MAX_LENGTH);
    setInput(cleaned);
    setError("");
  }

  function handleAdd() {
    const trimmed = input.trim();
    if (!isValidInterest(trimmed)) {
      setError("2–30 letters only (A–Z, spaces).");
      return;
    }
    const normalised = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    onAdd(normalised);
    setInput("");
    setError("");
  }

  return (
    <div className="mb-8">
      <h2 className="font-heading font-semibold text-base text-foreground mb-3">
        Filter by interest
      </h2>

      {/* Popular chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {popular.map((interest) => {
          const active = selected.includes(interest);
          return (
            <button
              key={interest}
              onClick={() => onToggle(interest)}
              className={cn(
                "text-sm px-3 py-1.5 rounded-full border font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              {interest}
              {active && <X className="inline-block w-3 h-3 ml-1 -mt-0.5" />}
            </button>
          );
        })}
      </div>

      {/* Selected custom interests */}
      {selected.filter((s) => !popular.includes(s)).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selected
            .filter((s) => !popular.includes(s))
            .map((interest) => (
              <button
                key={interest}
                onClick={() => onToggle(interest)}
                className="text-sm px-3 py-1.5 rounded-full border font-medium bg-primary text-primary-foreground border-primary transition-colors"
              >
                {interest}
                <X className="inline-block w-3 h-3 ml-1 -mt-0.5" />
              </button>
            ))}
        </div>
      )}

      {/* Add custom interest */}
      <div className="flex gap-2 items-start">
        <div className="flex-1">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
            placeholder="Add your own interest…"
            maxLength={INTEREST_MAX_LENGTH}
            className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
          />
          {error && <p className="text-xs text-destructive mt-1">{error}</p>}
          <p className="text-xs text-muted-foreground mt-1">
            Letters and spaces only, max {INTEREST_MAX_LENGTH} characters.
          </p>
        </div>
        <button
          onClick={handleAdd}
          disabled={!input.trim()}
          className={cn(
            "flex items-center gap-1 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors shrink-0",
            input.trim()
              ? "bg-foreground text-background hover:bg-foreground/90 border-foreground"
              : "bg-muted text-muted-foreground border-border cursor-not-allowed"
          )}
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
    </div>
  );
}

// ─── Main browser ─────────────────────────────────────────────────────────────

type Level = "categories" | "subcategories" | "divisions" | "groups";

export function PublicGroupsBrowser() {
  const [level, setLevel]                     = useState<Level>("categories");
  const [selectedCategory, setSelectedCategory]       = useState<Category | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<Subcategory | null>(null);
  const [selectedDivision, setSelectedDivision]       = useState<Division | null>(null);

  const [search, setSearch]               = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);

  const [allGroups, setAllGroups]     = useState<PublicGroup[]>([]);
  const [popularInterests, setPopularInterests] = useState<string[]>([]);
  const [loading, setLoading]         = useState(false);
  const [fetched, setFetched]         = useState(false);

  // ── Fetch groups + popular interests ─────────────────────────────────────
  useEffect(() => {
    if (fetched) return;
    setFetched(true);
    setLoading(true);

    const groupsQ = getDocs(
      query(collection(db, "groups"), where("isPrivate", "==", false), orderBy("name"), limit(300))
    ).then((snap) =>
      snap.docs.map((doc) => ({
        id: doc.id,
        name: doc.data().name ?? "",
        description: doc.data().description,
        type: doc.data().type,
        category: doc.data().category,
        subcategory: doc.data().subcategory,
        subSubcategory: doc.data().subSubcategory,
        city: doc.data().city,
        country: doc.data().country,
        isPrivate: doc.data().isPrivate,
        memberIds: doc.data().memberIds ?? [],
        interests: doc.data().interests ?? [],
        tags: doc.data().tags ?? [],
      })) as PublicGroup[]
    );

    // Fetch top interests by usage count from the shared interests collection
    const interestsQ = getDocs(
      query(collection(db, "interests"), orderBy("usageCount", "desc"), limit(24))
    ).then((snap) =>
      snap.docs.map((doc) => (doc.data().name as string) ?? doc.id).filter(Boolean)
    );

    Promise.all([groupsQ, interestsQ])
      .then(([groups, interests]) => {
        setAllGroups(groups);
        setPopularInterests(interests);
      })
      .catch(() => {/* Firestore unavailable — graceful empty state */})
      .finally(() => setLoading(false));
  }, [fetched]);

  // ── Derived: filtered groups for the current view ─────────────────────────
  const displayedGroups = (() => {
    let base = allGroups;

    // Location filter
    if (locationFilter.trim()) {
      const loc = locationFilter.trim().toLowerCase();
      base = base.filter(
        (g) => g.city?.toLowerCase().includes(loc) || g.country?.toLowerCase().includes(loc)
      );
    }

    // Interest filter
    base = base.filter((g) => matchesInterests(g, selectedInterests));

    // Full-text search: skip hierarchy when searching
    if (search.trim()) {
      return base.filter((g) => matchesSearch(g, search.trim()));
    }

    // Hierarchy drill-down
    if (level !== "groups") return [];
    if (selectedCategory) {
      base = base.filter((g) => matchesCategory(g, selectedCategory.id));
    }
    if (selectedSubcategory) {
      const withSub = base.filter((g) => matchesSubcategory(g, selectedSubcategory.id));
      if (withSub.length > 0) base = withSub;
    }
    if (selectedDivision) {
      const withDiv = base.filter((g) => matchesDivision(g, selectedDivision.id));
      if (withDiv.length > 0) base = withDiv;
    }

    return base;
  })();

  // ── Navigation ────────────────────────────────────────────────────────────
  function goToCategory(cat: Category) {
    setSelectedCategory(cat); setSelectedSubcategory(null); setSelectedDivision(null); setLevel("subcategories");
  }
  function goToSubcategory(sub: Subcategory) {
    setSelectedSubcategory(sub); setSelectedDivision(null); setLevel("divisions");
  }
  function goToDivision(div: Division) {
    setSelectedDivision(div); setLevel("groups");
  }
  function goBack() {
    if (level === "groups")        { setSelectedDivision(null);   setLevel("divisions"); }
    else if (level === "divisions") { setSelectedSubcategory(null); setLevel("subcategories"); }
    else if (level === "subcategories") { setSelectedCategory(null); setLevel("categories"); }
  }
  function resetToTop() {
    setLevel("categories"); setSelectedCategory(null); setSelectedSubcategory(null); setSelectedDivision(null);
  }

  // ── Interests ─────────────────────────────────────────────────────────────
  function toggleInterest(interest: string) {
    setSelectedInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    );
  }
  function addCustomInterest(interest: string) {
    if (!selectedInterests.includes(interest)) {
      setSelectedInterests((prev) => [...prev, interest]);
    }
  }

  // ── Breadcrumb ────────────────────────────────────────────────────────────
  const breadcrumbs = [
    { label: "All categories", onClick: resetToTop, active: level === "categories" },
    ...(selectedCategory ? [{
      label: selectedCategory.label,
      onClick: () => { setSelectedSubcategory(null); setSelectedDivision(null); setLevel("subcategories"); },
      active: level === "subcategories",
    }] : []),
    ...(selectedSubcategory ? [{
      label: selectedSubcategory.label,
      onClick: () => { setSelectedDivision(null); setLevel("divisions"); },
      active: level === "divisions",
    }] : []),
    ...(selectedDivision ? [{ label: selectedDivision.label, onClick: () => {}, active: true }] : []),
  ];

  function countForCategory(catId: string) {
    return allGroups.filter((g) => matchesCategory(g, catId)).length;
  }

  const isSearching = search.trim().length > 0;
  const hasActiveFilters = selectedInterests.length > 0 || locationFilter.trim().length > 0;

  return (
    <div>
      {/* ── Search + location ── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, interest or tag…"
            className="w-full pl-10 pr-10 py-3 rounded-xl border border-input bg-background text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="relative sm:w-52">
          <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            placeholder="City or country…"
            className="w-full pl-10 pr-10 py-3 rounded-xl border border-input bg-background text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
          />
          {locationFilter && (
            <button onClick={() => setLocationFilter("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Interests picker ── */}
      <InterestsPicker
        popular={popularInterests}
        selected={selectedInterests}
        onToggle={toggleInterest}
        onAdd={addCustomInterest}
      />

      {/* ── Clear all filters ── */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 mb-6">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {selectedInterests.map((i) => (
            <span key={i} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium">
              {i}
              <button onClick={() => toggleInterest(i)}><X className="w-3 h-3" /></button>
            </span>
          ))}
          {locationFilter && (
            <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium">
              <MapPin className="w-3 h-3" />{locationFilter}
              <button onClick={() => setLocationFilter("")}><X className="w-3 h-3" /></button>
            </span>
          )}
          <button
            onClick={() => { setSelectedInterests([]); setLocationFilter(""); }}
            className="text-xs text-muted-foreground hover:text-foreground underline ml-1 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="border-t border-border/40 pt-8">
        {/* ── Search results ── */}
        {isSearching && (
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              {loading ? "Searching…" : `${displayedGroups.length} result${displayedGroups.length !== 1 ? "s" : ""}`}
            </p>
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : displayedGroups.length === 0 ? (
              <EmptyState searchQuery={search} />
            ) : (
              <div className="space-y-3">{displayedGroups.map((g) => <GroupCard key={g.id} group={g} />)}</div>
            )}
          </div>
        )}

        {/* ── Drill-down browser ── */}
        {!isSearching && (
          <div>
            {level !== "categories" && (
              <button onClick={goBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
                <ChevronLeft className="w-4 h-4" />Back
              </button>
            )}
            <Breadcrumb items={breadcrumbs} />

            {level === "categories" && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {HIERARCHY.map((cat) => (
                  <NavCard
                    key={cat.id}
                    label={cat.label}
                    emoji={cat.emoji}
                    description={cat.description}
                    count={loading ? undefined : countForCategory(cat.id)}
                    color={cat.color}
                    onClick={() => goToCategory(cat)}
                  />
                ))}
              </div>
            )}

            {level === "subcategories" && selectedCategory && (
              <div>
                <h2 className="font-heading font-semibold text-xl text-foreground mb-4">
                  {selectedCategory.emoji} {selectedCategory.label}
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {selectedCategory.subcategories.map((sub) => (
                    <NavCard key={sub.id} label={sub.label} onClick={() => goToSubcategory(sub)} />
                  ))}
                </div>
              </div>
            )}

            {level === "divisions" && selectedSubcategory && (
              <div>
                <h2 className="font-heading font-semibold text-xl text-foreground mb-4">
                  {selectedCategory?.emoji} {selectedSubcategory.label}
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {selectedSubcategory.divisions.map((div) => (
                    <NavCard key={div.id} label={div.label} onClick={() => goToDivision(div)} />
                  ))}
                </div>
              </div>
            )}

            {level === "groups" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-heading font-semibold text-xl text-foreground">
                    {[selectedDivision?.label, selectedSubcategory?.label].filter(Boolean).join(" · ")}
                  </h2>
                  {!loading && <span className="text-sm text-muted-foreground">{displayedGroups.length} found</span>}
                </div>
                {loading ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : displayedGroups.length === 0 ? (
                  <EmptyState />
                ) : (
                  <div className="space-y-3">{displayedGroups.map((g) => <GroupCard key={g.id} group={g} />)}</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
