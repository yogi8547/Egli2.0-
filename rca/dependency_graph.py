"""Dependency graph manager for tracking component relationships and impact analysis.

Provides:
- Component registration and dependency mapping
- Downstream impact prediction
- Upstream dependency traversal
- Graph queries for correlation analysis
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from rca.models import Component, Dependency


class DependencyGraph:
    """Manages component dependencies and provides graph traversal utilities."""

    def __init__(self) -> None:
        self._components: dict[str, Component] = {}
        self._dependencies: list[Dependency] = []
        # source_id -> list of target_ids (what this depends on)
        self._forward: dict[str, list[str]] = {}
        # target_id -> list of source_ids (what depends on this)
        self._reverse: dict[str, list[str]] = {}

    def register_component(
        self,
        component_id: str,
        name: str,
        component_type: str = "server",
        tags: Optional[dict] = None,
        metadata: Optional[dict] = None,
        dependencies: Optional[list[str]] = None,
    ) -> Component:
        """Register or update a component with its dependencies.

        Args:
            component_id: Unique ID
            name: Human-readable name
            component_type: Type of component
            tags: Optional tags
            metadata: Optional metadata
            dependencies: List of component IDs this depends on

        Returns:
            The registered Component
        """
        now = datetime.utcnow()
        if component_id in self._components:
            comp = self._components[component_id]
            comp.name = name
            comp.component_type = component_type
            if tags:
                comp.tags.update(tags)
            if metadata:
                comp.metadata.update(metadata)
            comp.updated_at = now
        else:
            comp = Component(
                id=component_id,
                name=name,
                component_type=component_type,
                tags=tags or {},
                metadata=metadata or {},
                created_at=now,
                updated_at=now,
            )
            self._components[component_id] = comp

        # Update dependencies
        if dependencies is not None:
            # Remove old dependencies for this component
            self._dependencies = [
                d for d in self._dependencies if d.source_id != component_id
            ]
            for dep_id in dependencies:
                dep = Dependency(
                    source_id=component_id,
                    target_id=dep_id,
                    relationship_type="depends_on",
                )
                self._dependencies.append(dep)

        self._rebuild_indexes()
        return comp

    def _rebuild_indexes(self) -> None:
        """Rebuild the forward and reverse dependency indexes."""
        self._forward.clear()
        self._reverse.clear()

        for dep in self._dependencies:
            if dep.source_id not in self._forward:
                self._forward[dep.source_id] = []
            self._forward[dep.source_id].append(dep.target_id)

            if dep.target_id not in self._reverse:
                self._reverse[dep.target_id] = []
            self._reverse[dep.target_id].append(dep.source_id)

    def get_component(self, component_id: str) -> Optional[Component]:
        """Get a component by ID."""
        return self._components.get(component_id)

    def get_all_components(self) -> list[Component]:
        """Get all registered components."""
        return list(self._components.values())

    def get_dependencies(self, component_id: str) -> list[Component]:
        """Get components that this component depends on (upstream)."""
        dep_ids = self._forward.get(component_id, [])
        return [
            self._components[cid]
            for cid in dep_ids
            if cid in self._components
        ]

    def get_dependents(self, component_id: str) -> list[Component]:
        """Get components that depend on this component (downstream)."""
        dep_ids = self._reverse.get(component_id, [])
        return [
            self._components[cid]
            for cid in dep_ids
            if cid in self._components
        ]

    def get_downstream_impact(
        self,
        component_id: str,
        max_depth: int = 2,
    ) -> list[dict]:
        """Get the downstream impact tree for a component.

        Traverses the dependency graph to find all components that
        could be affected by this component's failure.

        Args:
            component_id: Root component to trace downstream from
            max_depth: Maximum traversal depth

        Returns:
            List of dicts with component info and depth
        """
        visited: set[str] = set()
        results: list[dict] = []
        self._traverse_downstream(component_id, 0, max_depth, visited, results)
        return results

    def _traverse_downstream(
        self,
        component_id: str,
        depth: int,
        max_depth: int,
        visited: set[str],
        results: list[dict],
    ) -> None:
        """Recursive downstream traversal helper."""
        if depth >= max_depth or component_id in visited:
            return

        visited.add(component_id)

        dependents = self.get_dependents(component_id)
        for dep in dependents:
            results.append({
                "component_id": dep.id,
                "component_name": dep.name,
                "component_type": dep.component_type,
                "depth": depth + 1,
                "relationship": f"depends on {component_id}",
            })
            self._traverse_downstream(
                dep.id, depth + 1, max_depth, visited, results,
            )

    def get_upstream_chain(
        self,
        component_id: str,
        max_depth: int = 3,
    ) -> list[dict]:
        """Get the upstream dependency chain for a component.

        Traces what this component depends on, recursively.

        Args:
            component_id: Component to trace upstream from
            max_depth: Maximum traversal depth

        Returns:
            List of dicts with component info and depth
        """
        visited: set[str] = set()
        results: list[dict] = []
        self._traverse_upstream(component_id, 0, max_depth, visited, results)
        return results

    def _traverse_upstream(
        self,
        component_id: str,
        depth: int,
        max_depth: int,
        visited: set[str],
        results: list[dict],
    ) -> None:
        """Recursive upstream traversal helper."""
        if depth >= max_depth or component_id in visited:
            return

        visited.add(component_id)

        deps = self.get_dependencies(component_id)
        for dep in deps:
            results.append({
                "component_id": dep.id,
                "component_name": dep.name,
                "component_type": dep.component_type,
                "depth": depth + 1,
                "relationship": f"{component_id} depends on this",
            })
            self._traverse_upstream(
                dep.id, depth + 1, max_depth, visited, results,
            )

    def find_path(
        self,
        from_id: str,
        to_id: str,
        max_depth: int = 5,
    ) -> list[str]:
        """Find a dependency path between two components (BFS)."""
        if from_id == to_id:
            return [from_id]

        visited: set[str] = {from_id}
        queue: list[tuple[str, list[str]]] = [(from_id, [from_id])]

        while queue:
            current, path = queue.pop(0)
            if len(path) >= max_depth:
                continue

            # Check forward (dependencies of current)
            for next_id in self._forward.get(current, []):
                if next_id == to_id:
                    return path + [next_id]
                if next_id not in visited:
                    visited.add(next_id)
                    queue.append((next_id, path + [next_id]))

            # Check reverse (dependents of current)
            for next_id in self._reverse.get(current, []):
                if next_id == to_id:
                    return path + [next_id]
                if next_id not in visited:
                    visited.add(next_id)
                    queue.append((next_id, path + [next_id]))

        return []

    def get_component_ids(self) -> list[str]:
        """Get all registered component IDs."""
        return list(self._components.keys())

    def get_related_component_ids(
        self,
        component_id: str,
        max_depth: int = 1,
    ) -> list[str]:
        """Get IDs of components related (upstream + downstream) to this one."""
        related: set[str] = set()

        # Upstream
        for dep in self.get_dependencies(component_id):
            related.add(dep.id)

        # Downstream
        for dep in self.get_dependents(component_id):
            related.add(dep.id)

        return list(related)
