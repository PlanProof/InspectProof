import { useState } from "react";
import { useListInspections } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge } from "@/components/ui";
import { Search, Calendar as CalendarIcon, CheckCircle2, XCircle, Clock } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function Inspections() {
  const [search, setSearch] = useState("");
  const { data: inspections, isLoading } = useListInspections({});

  const filtered = inspections?.filter(i => 
    i.projectName.toLowerCase().includes(search.toLowerCase()) ||
    i.inspectionType.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-sidebar tracking-tight">Inspections Register</h1>
          <p className="text-muted-foreground mt-1">Track and manage all field inspections.</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 border-b flex flex-wrap items-center gap-4 bg-muted/20">
          <div className="relative flex-1 min-w-[250px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by project or type..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="cursor-pointer hover:bg-muted px-3 py-1">Scheduled</Badge>
            <Badge variant="outline" className="cursor-pointer hover:bg-muted px-3 py-1">In Progress</Badge>
            <Badge variant="outline" className="cursor-pointer hover:bg-muted px-3 py-1">Completed</Badge>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading inspections...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date / Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Inspector</TableHead>
                <TableHead className="text-right">Results</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered?.map((insp) => (
                <TableRow key={insp.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-medium text-sidebar">{insp.projectName}</TableCell>
                  <TableCell className="capitalize">{insp.inspectionType.replace('_', ' ')}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm">
                      <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatDate(insp.scheduledDate)}
                      {insp.scheduledTime && <span className="text-muted-foreground ml-1">at {insp.scheduledTime}</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <InspectionStatusBadge status={insp.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{insp.inspectorName || "Unassigned"}</TableCell>
                  <TableCell className="text-right">
                    {insp.status === 'completed' ? (
                      <div className="flex items-center justify-end gap-2 text-xs font-medium">
                        <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3"/> {insp.passCount}</span>
                        <span className="text-red-600 flex items-center gap-1"><XCircle className="h-3 w-3"/> {insp.failCount}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs flex items-center justify-end gap-1"><Clock className="h-3 w-3"/> Pending</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </AppLayout>
  );
}

function InspectionStatusBadge({ status }: { status: string }) {
  const map: Record<string, "default" | "success" | "warning" | "secondary" | "destructive"> = {
    scheduled: "secondary",
    in_progress: "warning",
    completed: "success",
    follow_up_required: "destructive",
    cancelled: "default"
  };
  return (
    <Badge variant={map[status] || "default"} className="capitalize shadow-sm">
      {status.replace('_', ' ')}
    </Badge>
  );
}
