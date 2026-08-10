const fs = require('fs');
const path = require('path');

const SOURCE_DIR = 'C:\\inetpub\\wwwroot\\cmms-tpt\\public\\pages';
const TARGET_DIR = 'C:\\inetpub\\wwwroot\\cmms-tpt\\frontend\\app\\(dashboard)';

const getBoilerplate = (title, originalFile) => `"use client";

import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Icon } from "@astryxdesign/core/Icon";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/outline";

export default function Page() {
  return (
    <VStack gap={6}>
      <HStack hAlign="between" vAlign="center">
        <Heading level={2}>${title}</Heading>
      </HStack>
      
      <Card padding={6}>
        <VStack gap={4} hAlign="center" vAlign="center" style={{ minHeight: 300, textAlign: 'center' }}>
          <Icon icon={WrenchScrewdriverIcon} size="lg" color="disabled" />
          <Heading level={4}>Page Under Construction</Heading>
          <Text type="body" color="secondary">
            This page was automatically scaffolded from <code>${originalFile}</code>.
            The AI agents are working on migrating the functionality.
          </Text>
        </VStack>
      </Card>
    </VStack>
  );
}
`;

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

let scaffoldedCount = 0;
let skippedCount = 0;

walkDir(SOURCE_DIR, (filePath) => {
  if (!filePath.endsWith('.php')) return;

  const relativePath = path.relative(SOURCE_DIR, filePath); // e.g. repair\\copilot.php
  const parsed = path.parse(relativePath);
  
  let routePath = '';
  if (parsed.name === 'index') {
    routePath = parsed.dir; // e.g. repair
  } else {
    routePath = path.join(parsed.dir, parsed.name); // e.g. repair\\copilot
  }

  const targetPageDir = path.join(TARGET_DIR, routePath);
  const targetPageFile = path.join(targetPageDir, 'page.tsx');

  // Skip if it already exists (like the ones we built manually)
  if (fs.existsSync(targetPageFile)) {
    console.log("Skipped (Exists): " + routePath + "/page.tsx");
    skippedCount++;
    return;
  }

  // Create directories if they don't exist
  fs.mkdirSync(targetPageDir, { recursive: true });

  // Generate Title
  const titleWords = parsed.name === 'index' 
    ? (parsed.dir ? parsed.dir.split('\\\\').pop() : 'Dashboard') 
    : parsed.name;
  
  const formattedTitle = titleWords.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  fs.writeFileSync(targetPageFile, getBoilerplate(formattedTitle, relativePath), 'utf8');
  console.log("Scaffolded: " + routePath + "/page.tsx");
  scaffoldedCount++;
});

console.log("\nDone! Scaffolded: " + scaffoldedCount + " pages. Skipped: " + skippedCount + " pages.");
