-- depends: 0004.assets-created-updated-at

-- What a room or zone is used for (hotel_room, office, ...). NULL means
-- "not classified yet". No CHECK constraint: the closed enum is enforced by
-- the service layer, exactly as `type` already is.
ALTER TABLE assets ADD COLUMN usage TEXT;
