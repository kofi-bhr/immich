import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('partners_audit')
export class UserAuditEntity {
  @PrimaryColumn({ type: 'uuid', nullable: false, default: () => 'immich_uuid_v7()' })
  id!: string;

  @Index('IDX_partners_audit_user_id')
  @Column({ type: 'uuid' })
  sharedById!: string;

  @Index('IDX_partners_audit_partner_id')
  @Column({ type: 'uuid' })
  sharedWithId!: string;

  @Index('IDX_partners_audit_deleted_at')
  @CreateDateColumn({ type: 'timestamptz', default: () => 'clock_timestamp()' })
  deletedAt!: Date;
}
