#!/bin/sh
# NAT verso la VM Futuri (im)possibili - eseguire come root sul server host
# Le variabili vanno adattate: KLAB_IP e' l'IP dal quale il proxy klab raggiunge il server.

KLAB_IP=10.10.0.1
VM_IP=10.10.0.14
VM_PORT=3001
HOST_PORT=14301

iptables -t nat -A PREROUTING -p tcp --dport "${HOST_PORT}" -s "${KLAB_IP}" -j DNAT --to-destination "${VM_IP}:${VM_PORT}"
iptables -t nat -A POSTROUTING -p tcp -d "${VM_IP}" --dport "${VM_PORT}" -j MASQUERADE
iptables -A FORWARD -p tcp -d "${VM_IP}" --dport "${VM_PORT}" -j ACCEPT
iptables -A FORWARD -p tcp -s "${VM_IP}" --sport "${VM_PORT}" -m state --state ESTABLISHED,RELATED -j ACCEPT

echo "Regole applicate: ${HOST_PORT} -> ${VM_IP}:${VM_PORT} (solo da ${KLAB_IP})"
