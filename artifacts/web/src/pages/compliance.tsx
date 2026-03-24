import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Input, Card, CardContent } from "@/components/ui";
import { Search, BookOpen, ChevronRight, CheckCircle2 } from "lucide-react";

// Mock NCC Data fallback since there isn't a specific useGetNccReferences hook
const MOCK_NCC_DATA = [
  {
    id: "v1-c",
    volume: "NCC 2022 Volume One: Class 2-9 buildings",
    part: "Part C",
    title: "Fire Resistance",
    description: "Objective is to safeguard people from illness or injury due to a fire in a building.",
    requirements: [
      "Maintain structural stability during a fire",
      "Avoid the spread of fire",
      "Protect people during evacuation"
    ],
    applicable: ["Commercial", "Industrial", "Public Buildings"]
  },
  {
    id: "v1-d",
    volume: "NCC 2022 Volume One: Class 2-9 buildings",
    part: "Part D",
    title: "Access and Egress",
    description: "Provide, as far as is reasonable, people with safe, equitable and dignified access to a building, and the services and facilities within a building.",
    requirements: [
      "Adequate dimensions for accessways",
      "Safe evacuation routes",
      "Provision for people with disabilities"
    ],
    applicable: ["Commercial", "Industrial", "Public Buildings"]
  },
  {
    id: "v1-e",
    volume: "NCC 2022 Volume One: Class 2-9 buildings",
    part: "Part E",
    title: "Services and Equipment",
    description: "Safety installations including fire fighting equipment, smoke hazard management, and lift installations.",
    requirements: [
      "Fire hydrants and hose reels",
      "Sprinkler systems",
      "Emergency warning systems"
    ],
    applicable: ["High-rise Commercial", "Large Industrial", "Hospitals"]
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
      "Foundation stability"
    ],
    applicable: ["Residential Homes", "Garages", "Sheds"]
  },
  {
    id: "v2-h2",
    volume: "NCC 2022 Volume Two: Class 1 and 10",
    part: "Part H2",
    title: "Damp and weatherproofing",
    description: "To safeguard occupants from illness or loss of amenity due to moisture from the ground or weather.",
    requirements: [
      "Damp-proof courses",
      "Flashing and weatherproofing of openings",
      "Roof drainage systems"
    ],
    applicable: ["Residential Homes"]
  },
  {
    id: "v2-h3",
    volume: "NCC 2022 Volume Two: Class 1 and 10",
    part: "Part H3",
    title: "Fire safety",
    description: "Protection from fire spread between buildings and early warning for occupants.",
    requirements: [
      "Smoke alarms in dwellings",
      "Separating walls between units",
      "Bushfire prone area requirements"
    ],
    applicable: ["Residential Homes", "Townhouses"]
  }
];

export default function Compliance() {
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState(MOCK_NCC_DATA[0]);

  const filteredData = MOCK_NCC_DATA.filter(item => 
    item.title.toLowerCase().includes(search.toLowerCase()) || 
    item.part.toLowerCase().includes(search.toLowerCase()) ||
    item.volume.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-sidebar tracking-tight">NCC Compliance Reference</h1>
        <p className="text-muted-foreground mt-1">Browse National Construction Code sections and requirements.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
        {/* Left Panel: List */}
        <Card className="col-span-1 shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search NCC codes..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredData.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No sections found.</div>
            ) : (
              <div className="divide-y divide-border">
                {filteredData.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`w-full text-left p-4 hover:bg-muted/50 transition-colors flex items-start gap-3 ${selectedItem.id === item.id ? 'bg-muted/50 border-l-4 border-primary' : 'border-l-4 border-transparent'}`}
                  >
                    <BookOpen className={`h-5 w-5 mt-0.5 flex-shrink-0 ${selectedItem.id === item.id ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-accent tracking-wider mb-1">{item.part}</div>
                      <div className="text-sm font-medium text-sidebar leading-tight mb-1 truncate">{item.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{item.volume}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 self-center" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Right Panel: Details */}
        <Card className="col-span-1 md:col-span-2 shadow-sm overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto p-8">
            <div className="inline-block px-3 py-1 bg-accent/10 text-accent text-xs font-semibold rounded-full mb-4">
              {selectedItem.part}
            </div>
            <h2 className="text-2xl font-bold text-sidebar mb-2">{selectedItem.title}</h2>
            <p className="text-sm font-medium text-muted-foreground mb-8">{selectedItem.volume}</p>

            <div className="space-y-8">
              <section>
                <h3 className="text-lg font-semibold border-b pb-2 mb-4">Description</h3>
                <p className="text-sidebar/80 leading-relaxed">
                  {selectedItem.description}
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold border-b pb-2 mb-4">Key Requirements</h3>
                <ul className="space-y-3">
                  {selectedItem.requirements.map((req, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sidebar/90">{req}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-semibold border-b pb-2 mb-4">Applicable Building Types</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedItem.applicable.map((type, i) => (
                    <span key={i} className="px-3 py-1.5 bg-muted text-sidebar text-sm rounded-md font-medium">
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
