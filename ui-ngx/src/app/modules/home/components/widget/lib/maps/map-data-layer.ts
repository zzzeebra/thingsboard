///
/// Copyright © 2016-2024 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

import {
  CirclesDataLayerSettings,
  isCutPolygon,
  isValidLatLng,
  MapDataLayerSettings,
  mapDataSourceSettingsToDatasource,
  MapType,
  MarkersDataLayerSettings,
  PolygonsDataLayerSettings,
  TbCircleData,
  TbMapDatasource
} from '@home/components/widget/lib/maps/map.models';
import { TbMap } from '@home/components/widget/lib/maps/map';
import { FormattedData } from '@shared/models/widget.models';
import { Observable, of } from 'rxjs';
import { guid, isDefinedAndNotNull, isEmptyStr, isNotEmptyStr, isString } from '@core/utils';
import L, { LatLngBounds } from 'leaflet';
import { isJSON } from '@home/components/widget/lib/maps-legacy/maps-utils';

abstract class TbDataLayerItem<S extends MapDataLayerSettings, L extends TbMapDataLayer<S,L>> {

  protected layer: L.Layer;

  constructor(data: FormattedData<TbMapDatasource>,
              dsData: FormattedData<TbMapDatasource>[],
              protected settings: S,
              protected dataLayer: L) {
    this.layer = this.create(data, dsData);
    this.dataLayer.getFeatureGroup().addLayer(this.layer);
  }

  protected abstract create(data: FormattedData<TbMapDatasource>, dsData: FormattedData<TbMapDatasource>[]): L.Layer;

  public abstract update(data: FormattedData<TbMapDatasource>, dsData: FormattedData<TbMapDatasource>[]): void;

  public remove() {
    this.dataLayer.getFeatureGroup().removeLayer(this.layer);
  }

  protected updateLayer(newLayer: L.Layer) {
    this.dataLayer.getFeatureGroup().removeLayer(this.layer);
    this.layer = newLayer;
    this.dataLayer.getFeatureGroup().addLayer(this.layer);
  }

}

export enum MapDataLayerType {
   marker = 'marker',
   polygon = 'polygon',
   circle = 'circle'
}

export abstract class TbMapDataLayer<S extends MapDataLayerSettings, L extends TbMapDataLayer<S,L>> {

  protected datasource: TbMapDatasource;

  protected mapDataId = guid();

  protected featureGroup = L.featureGroup();

  protected layerItems = new Map<string, TbDataLayerItem<S,L>>();

  protected constructor(protected map: TbMap<any>,
                        protected settings: S) {
  }

  public setup(): Observable<void> {
    this.datasource = mapDataSourceSettingsToDatasource(this.settings);
    this.datasource.dataKeys = this.settings.additionalDataKeys ? [...this.settings.additionalDataKeys] : [];
    this.mapDataId = this.datasource.mapDataIds[0];
    this.datasource = this.setupDatasource(this.datasource);
    return this.doSetup();
  }

  public getDatasource(): TbMapDatasource {
    return this.datasource;
  }

  public getFeatureGroup(): L.FeatureGroup {
    return this.featureGroup;
  }

  public getBounds(): LatLngBounds {
    return this.featureGroup.getBounds();
  }

  public updateData(dsData: FormattedData<TbMapDatasource>[]) {
    const layerData = dsData.filter(d => d.$datasource.mapDataIds.includes(this.mapDataId));
    const rawItems = layerData.filter(d => this.isValidLayerData(d));
    const toDelete = new Set(Array.from(this.layerItems.keys()));
    rawItems.forEach((data, index) => {
      let layerItem = this.layerItems.get(data.entityId);
      if (layerItem) {
        layerItem.update(data, dsData);
      } else {
        layerItem = this.createLayerItem(data, dsData);
        this.layerItems.set(data.entityId, layerItem);
      }
      toDelete.delete(data.entityId);
    });
    toDelete.forEach((key) => {
      const item = this.layerItems.get(key);
      item.remove();
      this.layerItems.delete(key);
    });
  }

  protected setupDatasource(datasource: TbMapDatasource): TbMapDatasource {
    return datasource;
  }

  protected mapType(): MapType {
    return this.map.type();
  }

  public abstract dataLayerType(): MapDataLayerType;

  protected abstract doSetup(): Observable<void>;

  protected abstract isValidLayerData(layerData: FormattedData<TbMapDatasource>): boolean;

  protected abstract createLayerItem(data: FormattedData<TbMapDatasource>, dsData: FormattedData<TbMapDatasource>[]): TbDataLayerItem<S,L>;

}

class TbMarkerDataLayerItem extends TbDataLayerItem<MarkersDataLayerSettings, TbMarkersDataLayer> {

  private location: L.LatLng;
  private marker: L.Marker;

  constructor(data: FormattedData<TbMapDatasource>,
              dsData: FormattedData<TbMapDatasource>[],
              protected settings: MarkersDataLayerSettings,
              protected dataLayer: TbMarkersDataLayer) {
    super(data, dsData, settings, dataLayer);
  }

  protected create(data: FormattedData<TbMapDatasource>, dsData: FormattedData<TbMapDatasource>[]): L.Layer {
    this.location = this.dataLayer.extractLocation(data);
    this.marker = L.marker(this.location, {
      tbMarkerData: data
    });
    return this.marker;
  }
  public update(data: FormattedData<TbMapDatasource>, dsData: FormattedData<TbMapDatasource>[]): void {
    const position = this.dataLayer.extractLocation(data);
    if (!this.marker.getLatLng().equals(position)) {
      this.location = position;
      this.marker.setLatLng(position);
    }
  }

}

export class TbMarkersDataLayer extends TbMapDataLayer<MarkersDataLayerSettings, TbMarkersDataLayer> {

  constructor(protected map: TbMap<any>,
              protected settings: MarkersDataLayerSettings) {
    super(map, settings);
  }

  public dataLayerType(): MapDataLayerType {
    return MapDataLayerType.marker;
  }

  protected setupDatasource(datasource: TbMapDatasource): TbMapDatasource {
    datasource.dataKeys.push(this.settings.xKey, this.settings.yKey);
    return datasource;
  }

  protected doSetup(): Observable<void> {
    return of(null);
  }

  protected isValidLayerData(layerData: FormattedData<TbMapDatasource>): boolean {
    return !!this.extractPosition(layerData);
  }

  protected createLayerItem(data: FormattedData<TbMapDatasource>, dsData: FormattedData<TbMapDatasource>[]): TbMarkerDataLayerItem {
    return new TbMarkerDataLayerItem(data, dsData, this.settings, this);
  }

  private extractPosition(data: FormattedData<TbMapDatasource>):  {x: number; y: number} {
    if (data) {
      const xKeyVal = data[this.settings.xKey.label];
      const yKeyVal = data[this.settings.yKey.label];
      switch (this.mapType()) {
        case MapType.geoMap:
          if (!isValidLatLng(xKeyVal, yKeyVal)) {
            return null;
          }
          break;
        case MapType.image:
          if (!isDefinedAndNotNull(xKeyVal) || isEmptyStr(xKeyVal) || isNaN(xKeyVal) || !isDefinedAndNotNull(yKeyVal) || isEmptyStr(yKeyVal) || isNaN(yKeyVal)) {
            return null;
          }
          break;
      }
      return {x: xKeyVal, y: yKeyVal};
    } else {
      return null;
    }
  }

  public extractLocation(data: FormattedData<TbMapDatasource>): L.LatLng {
    const position = this.extractPosition(data);
    if (position) {
      return this.map.positionToLatLng(position);
    } else {
      return null;
    }
  }

}

class TbPolygonDataLayerItem extends TbDataLayerItem<PolygonsDataLayerSettings, TbPolygonsDataLayer> {

  private polygon: L.Polygon;

  constructor(data: FormattedData<TbMapDatasource>,
              dsData: FormattedData<TbMapDatasource>[],
              protected settings: PolygonsDataLayerSettings,
              protected dataLayer: TbPolygonsDataLayer) {
    super(data, dsData, settings, dataLayer);
  }

  protected create(data: FormattedData<TbMapDatasource>, dsData: FormattedData<TbMapDatasource>[]): L.Layer {
    const polyData = this.dataLayer.extractPolygonCoordinates(data);
    const polyConstructor = isCutPolygon(polyData) || polyData.length !== 2 ? L.polygon : L.rectangle;
    this.polygon = polyConstructor(polyData, {
      fill: true,
      fillColor: '#3a77e7',
      color: '#0742ad',
      weight: 1,
      fillOpacity: 0.4,
      opacity: 1
    });
    return this.polygon;
  }
  public update(data: FormattedData<TbMapDatasource>, dsData: FormattedData<TbMapDatasource>[]): void {
    const polyData = this.dataLayer.extractPolygonCoordinates(data);
    if (isCutPolygon(polyData) || polyData.length !== 2) {
      if (this.polygon instanceof L.Rectangle) {
        this.polygon = L.polygon(polyData, {
          fill: true,
          fillColor: '#3a77e7',
          color: '#0742ad',
          weight: 1,
          fillOpacity: 0.4,
          opacity: 1
        });
        this.updateLayer(this.polygon);
      } else {
        this.polygon.setLatLngs(polyData);
      }
    } else if (polyData.length === 2) {
      const bounds = new L.LatLngBounds(polyData);
      // @ts-ignore
      this.leafletPoly.setBounds(bounds);
    }
  }
}

export class TbPolygonsDataLayer extends TbMapDataLayer<PolygonsDataLayerSettings, TbPolygonsDataLayer> {

  constructor(protected map: TbMap<any>,
              protected settings: PolygonsDataLayerSettings) {
    super(map, settings);
  }

  public dataLayerType(): MapDataLayerType {
    return MapDataLayerType.polygon;
  }

  protected setupDatasource(datasource: TbMapDatasource): TbMapDatasource {
    datasource.dataKeys.push(this.settings.polygonKey);
    return datasource;
  }

  protected doSetup(): Observable<void> {
    return of(null);
  }

  protected isValidLayerData(layerData: FormattedData<TbMapDatasource>): boolean {
    return layerData && ((isNotEmptyStr(layerData[this.settings.polygonKey.label]) && !isJSON(layerData[this.settings.polygonKey.label])
      || Array.isArray(layerData[this.settings.polygonKey.label])));
  }

  protected createLayerItem(data: FormattedData<TbMapDatasource>, dsData: FormattedData<TbMapDatasource>[]): TbPolygonDataLayerItem {
    return new TbPolygonDataLayerItem(data, dsData, this.settings, this);
  }

  public extractPolygonCoordinates(data: FormattedData<TbMapDatasource>) {
    let rawPolyData = data[this.settings.polygonKey.label];
    if (isString(rawPolyData)) {
      rawPolyData = JSON.parse(rawPolyData);
    }
    return this.map.toPolygonCoordinates(rawPolyData);
  }
}

class TbCircleDataLayerItem extends TbDataLayerItem<CirclesDataLayerSettings, TbCirclesDataLayer> {

  private circle: L.Circle;

  constructor(data: FormattedData<TbMapDatasource>,
              dsData: FormattedData<TbMapDatasource>[],
              protected settings: CirclesDataLayerSettings,
              protected dataLayer: TbCirclesDataLayer) {
    super(data, dsData, settings, dataLayer);
  }

  protected create(data: FormattedData<TbMapDatasource>, dsData: FormattedData<TbMapDatasource>[]): L.Layer {
    const circleData = this.dataLayer.extractCircleCoordinates(data);
    const center = new L.LatLng(circleData.latitude, circleData.longitude);
    this.circle = L.circle(center, {
      radius: circleData.radius,
      fillColor: '#3a77e7',
      color: '#0742ad',
      weight: 1,
      fillOpacity: 0.4,
      opacity: 1
    });
    return this.circle;
  }

  public update(data: FormattedData<TbMapDatasource>, dsData: FormattedData<TbMapDatasource>[]): void {
    const circleData = this.dataLayer.extractCircleCoordinates(data);
    const center = new L.LatLng(circleData.latitude, circleData.longitude);
    if (!this.circle.getLatLng().equals(center)) {
      this.circle.setLatLng(center);
    }
    if (this.circle.getRadius() !== circleData.radius) {
      this.circle.setRadius(circleData.radius);
    }
  }
}

export class TbCirclesDataLayer extends TbMapDataLayer<CirclesDataLayerSettings, TbCirclesDataLayer> {

  constructor(protected map: TbMap<any>,
              protected settings: CirclesDataLayerSettings) {
    super(map, settings);
  }

  public dataLayerType(): MapDataLayerType {
    return MapDataLayerType.circle;
  }

  protected setupDatasource(datasource: TbMapDatasource): TbMapDatasource {
    datasource.dataKeys.push(this.settings.circleKey);
    return datasource;
  }

  protected doSetup(): Observable<void> {
    return of(null);
  }

  protected isValidLayerData(layerData: FormattedData<TbMapDatasource>): boolean {
    return layerData && isNotEmptyStr(layerData[this.settings.circleKey.label]) && isJSON(layerData[this.settings.circleKey.label]);
  }

  protected createLayerItem(data: FormattedData<TbMapDatasource>, dsData: FormattedData<TbMapDatasource>[]): TbDataLayerItem<CirclesDataLayerSettings, TbCirclesDataLayer> {
    throw new TbCircleDataLayerItem(data, dsData, this.settings, this);
  }

  public extractCircleCoordinates(data: FormattedData<TbMapDatasource>) {
    const circleData: TbCircleData = JSON.parse(data[this.settings.circleKey.label]);
    return this.map.convertCircleData(circleData);
  }


}
