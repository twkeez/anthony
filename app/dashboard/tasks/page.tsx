import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchAllTasksSorted, type TaskSortKey } from "@/lib/data/tasks";

type Search = Record<string, string | string[] | undefined>;

function first(param: string | string[] | undefined) {
  if (Array.isArray(param)) return param[0];
  return param;
}

export default async function AllTasksPage(props: { searchParams?: Promise<Search> }) {
  const sp = (await props.searchParams) ?? {};
  const sortRaw = first(sp.sort);
  const orderRaw = first(sp.order);
  const sort: TaskSortKey = sortRaw === "assigned_to" ? "assigned_to" : "due_date";
  const order = orderRaw === "desc" ? "desc" : "asc";

  const tasks = await fetchAllTasksSorted(sort, order);

  const nextOrder = order === "asc" ? "desc" : "asc";
  const dueHref = `/dashboard/tasks?sort=due_date&order=${sort === "due_date" ? nextOrder : "asc"}`;
  const assignHref = `/dashboard/tasks?sort=assigned_to&order=${
    sort === "assigned_to" ? nextOrder : "asc"
  }`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">All tasks</h1>
        <p className="text-zinc-500 mt-1 text-sm">Every open task across clients. Sorting applies to the full list.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={dueHref}
          className={cn(
            buttonVariants({ variant: sort === "due_date" ? "default" : "outline" }),
            sort === "due_date"
              ? "bg-zinc-100 text-zinc-950 hover:bg-zinc-200"
              : "border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-900",
          )}
        >
          Due date {sort === "due_date" ? `(${order})` : ""}
        </Link>
        <Link
          href={assignHref}
          className={cn(
            buttonVariants({ variant: sort === "assigned_to" ? "default" : "outline" }),
            sort === "assigned_to"
              ? "bg-zinc-100 text-zinc-950 hover:bg-zinc-200"
              : "border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-900",
          )}
        >
          Assigned to {sort === "assigned_to" ? `(${order})` : ""}
        </Link>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 overflow-hidden rounded-xl shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-zinc-500 py-8 text-center text-sm">
                  No tasks yet. Add one from any client detail page.
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    {t.clients?.id ? (
                      <Link className="text-sky-400 hover:text-sky-300 hover:underline" href={`/dashboard/clients/${t.clients.id}`}>
                        {t.clients.business_name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="max-w-md">
                      <p className="font-medium">{t.title}</p>
                      {t.description ? (
                        <p className="text-zinc-500 line-clamp-2 text-xs">{t.description}</p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-zinc-500 whitespace-nowrap">
                    {t.assigned_to ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{t.due_date ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap capitalize">{t.status}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
