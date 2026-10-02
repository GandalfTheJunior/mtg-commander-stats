package io.github.gandalfthejunior.mtgcommanderstats.group.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import io.github.gandalfthejunior.mtgcommanderstats.group.domain.GroupMembership;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GroupMembershipRepository extends JpaRepository<GroupMembership, UUID> {
    Optional<GroupMembership> findByGroupIdAndUserId(UUID groupId, UUID userId);

    List<GroupMembership> findAllByUserIdAndActiveTrue(UUID userId);

    List<GroupMembership> findAllByGroupIdAndActiveTrue(UUID groupId);
}
