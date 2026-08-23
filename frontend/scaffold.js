const fs = require('fs');
const path = require('path');

const SOURCE_DIR = 'C:\\inetpub\\wwwroot\\cmms-tpt\\public\\pages';
const TARGET_DIR = 'C:\\inetpub\\wwwroot\\cmms-tpt\\frontend\\app\\(dashboard)';

const getBoilerplate = (title, originalFile) => `"use client";

import { PageShell } from "@/components/PageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Inbox } from "lucide-react";

export default function Page() {
  return (
    <PageShell breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "${title}" }]} title="${title}">
      <Card>
        <CardContent className="flex min-h-[300px] flex-col items-center justify-center gap-4 text-center">
          <Inbox size={32} strokeWidth={1.75} aria-hidden="true" className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            This page was automatically scaffolded from <code>${originalFile}</code>.
            The AI agents are working on migrating the functionality.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
`;

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
