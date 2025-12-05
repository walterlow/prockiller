// Sample Unix lsof -i :PORT -P -n output for testing

export const LSOF_SINGLE_PROCESS = `COMMAND   PID   USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node    12345 walter   23u  IPv4  12345      0t0  TCP *:3000 (LISTEN)`;

export const LSOF_MULTIPLE_PROCESSES = `COMMAND   PID   USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node    12345 walter   23u  IPv4  12345      0t0  TCP *:3000 (LISTEN)
node    12345 walter   24u  IPv6  12346      0t0  TCP *:3000 (LISTEN)
nginx   67890 root     10u  IPv4  67890      0t0  TCP *:3000 (LISTEN)`;

export const LSOF_EMPTY = `COMMAND   PID   USER   FD   TYPE DEVICE SIZE/OFF NODE NAME`;

export const LSOF_HEADER_ONLY = `COMMAND   PID   USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
`;

export const LSOF_UDP = `COMMAND   PID   USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node    12345 walter   23u  IPv4  12345      0t0  UDP *:3000`;

export const LSOF_MALFORMED = `COMMAND   PID
partial line
node    12345 walter   23u  IPv4  12345      0t0  TCP *:3000 (LISTEN)`;

export const LSOF_ESTABLISHED = `COMMAND   PID   USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node    12345 walter   23u  IPv4  12345      0t0  TCP 127.0.0.1:3000->127.0.0.1:45678 (ESTABLISHED)
node    12345 walter   24u  IPv4  12346      0t0  TCP *:3000 (LISTEN)`;
