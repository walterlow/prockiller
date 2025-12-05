// Sample Windows tasklist /FI "PID eq X" /FO CSV /NH output for testing

export const TASKLIST_NODE = `"node.exe","12345","Console","1","50,000 K"`;

export const TASKLIST_NGINX = `"nginx.exe","67890","Console","1","25,000 K"`;

export const TASKLIST_CHROME = `"chrome.exe","11111","Console","1","150,000 K"`;

export const TASKLIST_NO_INFO = `INFO: No tasks are running which match the specified criteria.`;

export const TASKLIST_MALFORMED = `invalid output
with no quotes`;

export const TASKLIST_LONG_NAME = `"very-long-process-name-with-many-characters.exe","12345","Console","1","50,000 K"`;
