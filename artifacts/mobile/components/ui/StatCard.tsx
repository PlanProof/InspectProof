import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: string;
  color?: string;
  bgColor?: string;
  trend?: string;
}

export function StatCard({ label, value, icon, color = Colors.secondary, bgColor = Colors.infoLight, trend }: StatCardProps) {
  return (
    <View style={styles.card}>
      <View style={[styles.iconWrapper, { backgroundColor: bgColor }]}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {trend && <Text style={styles.trend}>{trend}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  value: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },
  label: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  trend: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.success,
    marginTop: 2,
  },
});
