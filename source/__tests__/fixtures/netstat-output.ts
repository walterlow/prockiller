// Sample Windows netstat -ano output for testing

export const NETSTAT_SINGLE_PROCESS = `
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       12345
`;

export const NETSTAT_MULTIPLE_PROCESSES = `
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       12345
  TCP    127.0.0.1:3000         0.0.0.0:0              LISTENING       12345
  TCP    [::]:3000              [::]:0                 LISTENING       67890
  UDP    0.0.0.0:3000           *:*                                    11111
`;

export const NETSTAT_NO_MATCH = `
  TCP    0.0.0.0:8080           0.0.0.0:0              LISTENING       99999
`;

export const NETSTAT_MALFORMED = `
  TCP    invalid line
  garbage data
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       12345
`;

export const NETSTAT_IPV6 = `
  TCP    [::1]:3000             [::]:0                 LISTENING       12345
  TCP    [fe80::1%12]:3000      [::]:0                 LISTENING       67890
`;

export const NETSTAT_EMPTY = ``;

export const NETSTAT_TIME_WAIT = `
  TCP    192.168.1.100:3000     52.5.6.7:443           TIME_WAIT       0
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       12345
`;
