import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Input, Card, CardContent } from "@/components/ui";
import { Search, BookOpen, ChevronRight, CheckCircle2, TrendingUp, ClipboardCheck, AlertTriangle } from "lucide-react";
import { useGetDashboardAnalytics, useGetAnalyticsTrends } from "@workspace/api-client-react";

const NCC_DATA = [
  {
    id: "v1-c",
    volume: "NCC 2022 Volume One: Class 2–9 buildings",
    part: "Part C",
    title: "Fire Resistance",
    description: "Objective is to safeguard people from illness or injury due to a fire in a building.",
    requirements: [
      "Maintain structural stability during a fire",
      "Avoid the spread of fire",
      "Protect people during evacuation",
    ],
    applicable: ["Commercial", "Industrial", "Public Buildings"],
  },
  {
    id: "v1-d",
    volume: "NCC 2022 Volume One: Class 2–9 buildings",
    part: "Part D",
    title: "Access and Egress",
    description: "Provide, as far as is reasonable, people with safe, equitable and dignified access to a building, and the services and facilities within a building.",
    requirements: [
      "Adequate dimensions for accessways",
      "Safe evacuation routes",
      "Provision for people with disabilities",
    ],
    applicable: ["Commercial", "Industrial", "Public Buildings"],
  },
  {
    id: "v1-e",
    volume: "NCC 2022 Volume One: Class 2–9 buildings",
    part: "Part E",
    title: "Services and Equipment",
    description: "Safety installations including fire fighting equipment, smoke hazard management, and lift installations.",
    requirements: [
      "Fire hydrants and hose reels",
      "Sprinkler systems",
      "Emergency warning systems",
    ],
    applicable: ["High-rise Commercial", "Large Industrial", "Hospitals"],
  },
  {
    id: "v2-h1",
    volume: "NCC 2022 Volume Two: Class 1 and 10",
    part: "Part H1",
    title: "Structure",
    description: "A building or structure is to withstand the combination of loads and other actions to which it may be reasonably subjected.",
    requirements: [
      "Resistance to dead and live loads",
      "Wind and earthquake resistance",
      "Foundation stability",
    ],
    applicable: ["Residential Homes", "Garages", "Sheds"],
  },
  {
    id: "v2-h2",
    volume: "NCC 2022 Volume Two: Class 1 and 10",
    part: "Part H2",
    title: "Damp and Weatherproofing",
    description: "To safeguard occupants from illness or loss of amenity due to moisture from the ground or weather.",
    requirements: [
      "Damp-proof courses",
      "Flashing and weatherproofing of openings",
      "Roof drainage systems",
    ],
    applicable: ["Residential Homes"],
  },
  {
    id: "v2-h3",
    volume: "NCC 2022 Volume Two: Class 1 and 10",
    part: "Part H3",
    title: "Fire Safety",
    description: "Protection from fire spread between buildings and early warning for occupants.",
    requirements: [
      "Smoke alarms in dwellings",
      "Separating walls between units",
      "Bushfire prone area requirements",
    ],
    applicable: ["Residential Homes", "Townhouses"],
  },
];

export default function Compliance() {
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState(NCC_DATA[0]);

  const { data: dash } = useGetDashboardAnalytics();
  const { data: trends } = useGetAnalyticsTrends();

  const complianceRate = trends?.complianceRate ?? dash?.complianceRate ?? null;
  const openIssues = dash?.openIssues ?? 0;
  const totalInspections = dash?.totalInspections ?? 0;

  const filteredData = NCC_DATA.filter(
    item =>
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.part.toLowerCase().includes(search.toLowerCase()) ||
      item.volume.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-sidebar tracking-tight">NCC Compliance</h1>
        <p className="text-muted-foreground mt-1">
          Live compliance stats and National Construction Code reference.
        </p>
      </div>

      {/* Live Compliance Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-green-100">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Compliance Rate</p>
              <p className="text-2xl font-bold text-sidebar">
                {complianceRate !== null ? `${complianceRate}%` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {complianceRate !== null ? "Based on checklist results" : "No checklist data yet"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-100">
              <ClipboardCheck className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Inspections</p>
              <p className="text-2xl font-bold text-sidebar">{totalInspections}</p>
              <p className="text-xs text-muted-foreground">All time</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-red-100">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Open Issues</p>
              <p className="text-2xl font-bold text-sidebar">{openIssues}</p>
              <p className="text-xs text-muted-foreground">Requires attention</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* NCC Reference Browser */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-360px)]">
        {/* Left Panel */}
        <Card className="col-span-1 shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              NCC Reference
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search NCC codes…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredData.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No sections found.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredData.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`w-full text-left p-4 hover:bg-muted/50 transition-colors flex items-start gap-3 ${
                      selectedItem.id === item.id
                        ? "bg-muted/50 border-l-4 border-primary"
                        : "border-l-4 border-transparent"
                    }`}
                  >
                    <BookOpen
                      className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                        selectedItem.id === item.id ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-[#C5D92D] tracking-wider mb-1">
                        {item.part}
                      </div>
                      <div className="text-sm font-medium text-sidebar leading-tight mb-1 truncate">
                        {item.title}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{item.volume}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 self-center" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Right Panel */}
        <Card className="col-span-1 md:col-span-2 shadow-sm overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto p-8">
            <div className="inline-block px-3 py-1 bg-[#C5D92D]/10 text-[#8a9a1e] text-xs font-semibold rounded-full mb-4">
              {selectedItem.part}
            </div>
            <h2 className="text-2xl font-bold text-sidebar mb-2">{selectedItem.title}</h2>
            <p className="text-sm font-medium text-muted-foreground mb-8">{selectedItem.volume}</p>

            <div className="space-y-8">
              <section>
                <h3 className="text-lg font-semibold border-b pb-2 mb-4">Description</h3>
                <p className="text-sidebar/80 leading-relaxed">{selectedItem.description}</p>
              </section>

              <section>
                <h3 className="text-lg font-semibold border-b pb-2 mb-4">Key Requirements</h3>
                <ul className="space-y-3">
                  {selectedItem.requirements.map((req, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-[#466DB5] shrink-0 mt-0.5" />
                      <span className="text-sidebar/90">{req}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold border-b pb-2 mb-4">Applicable Building Types</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedItem.applicable.map((type, i) => (
                    <span
                      key={i}
                      className="px-3 py-1.5 bg-muted text-sidebar text-sm rounded-md font-medium"
                    >
                      {type}
                    </span>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
