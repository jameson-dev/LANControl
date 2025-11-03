#!/usr/bin/env python3
"""
V3 Migration Script - Add new columns and tables for V3 features
"""
import sqlite3
import sys
import os

DB_PATH = 'data/lancontrol.db'

def migrate_v3():
    """Add V3 columns and tables to existing database"""

    if not os.path.exists(DB_PATH):
        print(f"Error: Database not found at {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("Starting V3 migration...")

    try:
        # Add new columns to devices table
        print("Adding new columns to devices table...")

        new_columns = [
            ("notes", "TEXT"),
            ("purchase_date", "DATE"),
            ("warranty_until", "DATE"),
            ("device_type", "VARCHAR(50)")
        ]

        for col_name, col_type in new_columns:
            try:
                cursor.execute(f"ALTER TABLE devices ADD COLUMN {col_name} {col_type}")
                print(f"  ✓ Added column: {col_name}")
            except sqlite3.OperationalError as e:
                if "duplicate column name" in str(e):
                    print(f"  ⊙ Column {col_name} already exists")
                else:
                    raise

        # Create network_topology table
        print("\nCreating network_topology table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS network_topology (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id INTEGER NOT NULL,
                connected_to_id INTEGER,
                connection_type VARCHAR(20) DEFAULT 'ethernet',
                position_x INTEGER DEFAULT 0,
                position_y INTEGER DEFAULT 0,
                discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_id) REFERENCES devices (id),
                FOREIGN KEY (connected_to_id) REFERENCES devices (id)
            )
        """)
        print("  ✓ Created network_topology table")

        # Create bandwidth_usage table
        print("\nCreating bandwidth_usage table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bandwidth_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id INTEGER NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                bytes_sent BIGINT DEFAULT 0,
                bytes_received BIGINT DEFAULT 0,
                packets_sent INTEGER DEFAULT 0,
                packets_received INTEGER DEFAULT 0,
                active_connections INTEGER DEFAULT 0,
                FOREIGN KEY (device_id) REFERENCES devices (id)
            )
        """)
        print("  ✓ Created bandwidth_usage table")

        # Create indexes
        print("\nCreating indexes...")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_bandwidth_device_time
            ON bandwidth_usage (device_id, timestamp)
        """)
        print("  ✓ Created bandwidth index")

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_topology_device
            ON network_topology (device_id)
        """)
        print("  ✓ Created topology index")

        conn.commit()

        print("\n" + "="*60)
        print("✓ V3 Migration completed successfully!")
        print("="*60)
        print("\nNew features added:")
        print("  • Device Notes & Documentation")
        print("  • Network Topology Mapping")
        print("  • Bandwidth Monitoring")
        print("  • Enhanced Grouping")
        print("\nRestart the LANControl service to use new features.")

    except Exception as e:
        conn.rollback()
        print(f"\n❌ Migration failed: {e}")
        sys.exit(1)
    finally:
        conn.close()

if __name__ == '__main__':
    migrate_v3()
